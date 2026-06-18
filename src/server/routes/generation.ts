import { Hono } from "hono";
import { db } from "../db";
import { generationQueue } from "../lib/queue";
import type { GenerationJob } from "../workers/generationWorker";

const generationRouter = new Hono();

async function enqueuePostGeneration(postId: number): Promise<number> {
  // Fetch post + brand
  const { rows: postRows } = await db.query(
    `SELECT p.*, b.style_instructions
     FROM posts p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.id = $1`,
    [postId]
  );
  if (!postRows[0]) return 0;
  const post = postRows[0];

  // Fetch pending/failed assets
  const { rows: assets } = await db.query(
    `SELECT * FROM post_assets WHERE post_id=$1 AND generation_status IN ('pending','failed')`,
    [postId]
  );

  if (assets.length === 0) return 0;

  // Set post status to generating
  await db.query(
    "UPDATE posts SET status='generating' WHERE id=$1",
    [postId]
  );

  // Reset failed assets back to pending
  await db.query(
    "UPDATE post_assets SET generation_status='pending' WHERE post_id=$1 AND generation_status='failed'",
    [postId]
  );

  for (const asset of assets) {
    const jobData: GenerationJob = {
      postAssetId: asset.id,
      postId: postId,
      assetType: asset.asset_type,
      copy: post.copy,
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

// POST /api/posts/:id/generate
generationRouter.post("/posts/:id/generate", async (c) => {
  const postId = Number(c.req.param("id"));
  const queued = await enqueuePostGeneration(postId);
  return c.json({ queued });
});

// POST /api/generation/batch
generationRouter.post("/generation/batch", async (c) => {
  const body = await c.req.json<{ postIds: number[] }>();
  let totalQueued = 0;
  for (const postId of body.postIds ?? []) {
    totalQueued += await enqueuePostGeneration(postId);
  }
  return c.json({ queued: totalQueued, posts: body.postIds?.length ?? 0 });
});

// POST /api/posts/:id/regenerate-asset/:assetId
generationRouter.post("/posts/:id/regenerate-asset/:assetId", async (c) => {
  const postId = Number(c.req.param("id"));
  const assetId = Number(c.req.param("assetId"));

  const { rows: postRows } = await db.query(
    `SELECT p.*, b.style_instructions
     FROM posts p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.id = $1`,
    [postId]
  );
  if (!postRows[0]) return c.json({ error: "Post not found" }, 404);
  const post = postRows[0];

  const { rows: assetRows } = await db.query(
    "SELECT * FROM post_assets WHERE id=$1 AND post_id=$2",
    [assetId, postId]
  );
  if (!assetRows[0]) return c.json({ error: "Asset not found" }, 404);
  const asset = assetRows[0];

  await db.query(
    "UPDATE post_assets SET generation_status='pending' WHERE id=$1",
    [assetId]
  );
  // If post was pending_approval or failed, move back to generating
  await db.query(
    "UPDATE posts SET status='generating' WHERE id=$1 AND status IN ('pending_approval','failed','approved')",
    [postId]
  );

  const jobData: GenerationJob = {
    postAssetId: assetId,
    postId: postId,
    assetType: asset.asset_type,
    copy: post.copy,
    styleInstructions: post.style_instructions ?? "",
    qualityTier: post.quality_tier ?? "standard",
  };
  await generationQueue.add(`asset-regen-${assetId}`, jobData, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  });

  return c.json({ ok: true });
});

export default generationRouter;
