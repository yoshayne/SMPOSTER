import { Hono } from "hono";
import { db } from "../db";
import { generationQueue } from "../lib/queue";
import { checkBudget, estimateAssetCost, getCurrentSpend } from "../lib/budget";
import type { GenerationJob } from "../workers/generationWorker";

const generationRouter = new Hono();

async function estimatePostCost(postId: number): Promise<number> {
  const { rows } = await db.query<{ asset_type: string; quality_tier: string }>(
    `SELECT pa.asset_type, p.quality_tier
     FROM post_assets pa
     JOIN posts p ON p.id = pa.post_id
     WHERE pa.post_id=$1 AND pa.generation_status IN ('pending','failed')`,
    [postId]
  );
  return rows.reduce((sum, r) => sum + estimateAssetCost(r.asset_type, r.quality_tier), 0);
}

async function enqueuePostGeneration(postId: number): Promise<number> {
  const { rows: postRows } = await db.query(
    `SELECT p.*, b.style_instructions FROM posts p JOIN brands b ON b.id = p.brand_id WHERE p.id = $1`,
    [postId]
  );
  if (!postRows[0]) return 0;
  const post = postRows[0];

  const { rows: assets } = await db.query(
    `SELECT * FROM post_assets WHERE post_id=$1 AND generation_status IN ('pending','failed')`,
    [postId]
  );
  if (assets.length === 0) return 0;

  await db.query("UPDATE posts SET status='generating', updated_at=NOW() WHERE id=$1", [postId]);
  await db.query(
    "UPDATE post_assets SET generation_status='pending' WHERE post_id=$1 AND generation_status='failed'",
    [postId]
  );

  for (const asset of assets) {
    const jobData: GenerationJob = {
      postAssetId: asset.id,
      postId,
      assetType: asset.asset_type,
      copy: post.copy,
      onImageText: post.on_image_text ?? null,
      styleInstructions: post.style_instructions ?? "",
      qualityTier: post.quality_tier ?? "standard",
    };
    await generationQueue.add(`asset-${asset.id}`, jobData, {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    });
  }
  return assets.length;
}

// GET /api/generation/estimate?post_ids=1,2,3
generationRouter.get("/generation/estimate", async (c) => {
  const ids = (c.req.query("post_ids") ?? "")
    .split(",")
    .map(Number)
    .filter(Boolean);

  let totalEstimate = 0;
  for (const id of ids) {
    totalEstimate += await estimatePostCost(id);
  }
  const spend = await getCurrentSpend();
  const { cap, remaining } = await checkBudget(0);

  return c.json({ estimatedCost: totalEstimate, currentSpend: spend, cap, remaining });
});

// POST /api/posts/:id/generate
generationRouter.post("/posts/:id/generate", async (c) => {
  const postId = Number(c.req.param("id"));
  const body = await c.req.json<{ override?: boolean }>().catch(() => ({ override: false }));

  const estimate = await estimatePostCost(postId);
  const budget = await checkBudget(estimate);

  if (!budget.allowed && !body.override) {
    return c.json({
      error: "budget_exceeded",
      message: `This generation would cost ~$${estimate.toFixed(2)} but only $${(budget.remaining ?? 0).toFixed(2)} remains in your monthly budget.`,
      estimatedCost: estimate,
      remaining: budget.remaining,
      cap: budget.cap,
      spend: budget.spend,
    }, 402);
  }

  const queued = await enqueuePostGeneration(postId);
  return c.json({ queued, estimatedCost: estimate });
});

// POST /api/generation/batch
generationRouter.post("/generation/batch", async (c) => {
  const body = await c.req.json<{ postIds: number[]; override?: boolean }>();
  const postIds = body.postIds ?? [];

  let totalEstimate = 0;
  for (const id of postIds) {
    totalEstimate += await estimatePostCost(id);
  }

  const budget = await checkBudget(totalEstimate);
  if (!budget.allowed && !body.override) {
    return c.json({
      error: "budget_exceeded",
      message: `This batch would cost ~$${totalEstimate.toFixed(2)} but only $${(budget.remaining ?? 0).toFixed(2)} remains in your monthly budget.`,
      estimatedCost: totalEstimate,
      remaining: budget.remaining,
      cap: budget.cap,
      spend: budget.spend,
    }, 402);
  }

  let totalQueued = 0;
  for (const id of postIds) {
    totalQueued += await enqueuePostGeneration(id);
  }
  return c.json({ queued: totalQueued, posts: postIds.length, estimatedCost: totalEstimate });
});

// POST /api/posts/:id/regenerate-asset/:assetId
generationRouter.post("/posts/:id/regenerate-asset/:assetId", async (c) => {
  const postId = Number(c.req.param("id"));
  const assetId = Number(c.req.param("assetId"));

  const { rows: postRows } = await db.query(
    `SELECT p.*, b.style_instructions FROM posts p JOIN brands b ON b.id = p.brand_id WHERE p.id = $1`,
    [postId]
  );
  if (!postRows[0]) return c.json({ error: "Post not found" }, 404);

  const { rows: assetRows } = await db.query(
    "SELECT * FROM post_assets WHERE id=$1 AND post_id=$2",
    [assetId, postId]
  );
  if (!assetRows[0]) return c.json({ error: "Asset not found" }, 404);

  const estimate = estimateAssetCost(assetRows[0].asset_type, postRows[0].quality_tier ?? "standard");
  const budget = await checkBudget(estimate);
  const body = await c.req.json<{ override?: boolean }>().catch(() => ({ override: false }));

  if (!budget.allowed && !body.override) {
    return c.json({
      error: "budget_exceeded",
      message: `Regeneration would cost ~$${estimate.toFixed(2)} but only $${(budget.remaining ?? 0).toFixed(2)} remains.`,
      estimatedCost: estimate,
      remaining: budget.remaining,
    }, 402);
  }

  await db.query("UPDATE post_assets SET generation_status='pending' WHERE id=$1", [assetId]);
  await db.query(
    "UPDATE posts SET status='generating', updated_at=NOW() WHERE id=$1 AND status IN ('pending_approval','failed','approved')",
    [postId]
  );

  const jobData: GenerationJob = {
    postAssetId: assetId,
    postId,
    assetType: assetRows[0].asset_type,
    copy: postRows[0].copy,
    onImageText: postRows[0].on_image_text ?? null,
    styleInstructions: postRows[0].style_instructions ?? "",
    qualityTier: postRows[0].quality_tier ?? "standard",
  };
  await generationQueue.add(`asset-regen-${assetId}`, jobData, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  });

  return c.json({ ok: true, estimatedCost: estimate });
});

export default generationRouter;
