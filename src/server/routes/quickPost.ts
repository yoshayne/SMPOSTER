import { Hono } from "hono";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../db";
import { s3 } from "../s3";

const quickPostRouter = new Hono();

// POST /api/quick-post/asset — upload asset to bucket
quickPostRouter.post("/quick-post/asset", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const storageKey = `quick-post/${Date.now()}-${sanitizedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: storageKey,
      Body: buffer,
      ContentType: file.type,
    })
  );

  return c.json({ storage_key: storageKey });
});

// POST /api/quick-post — create the post
quickPostRouter.post("/quick-post", async (c) => {
  const body = await c.req.json<{
    brand_id: number;
    asset_storage_key: string;
    asset_type: string;
    copy: string;
    scheduled_at: string; // ISO UTC string
    status?: string;
    caption_fb?: string;
    caption_ig?: string;
    platforms: string[];
  }>();

  const status = body.status ?? "approved";

  const { rows: postRows } = await db.query(
    `INSERT INTO posts (brand_id, copy, scheduled_at, status, quality_tier, source)
     VALUES ($1, $2, $3, $4, 'standard', 'manual')
     RETURNING *`,
    [body.brand_id, body.copy, body.scheduled_at, status]
  );
  const post = postRows[0];

  const assetType = body.asset_type ?? "image";
  await db.query(
    `INSERT INTO post_assets (post_id, asset_type, generation_status, storage_key, provider)
     VALUES ($1, $2, 'approved', $3, 'manual')`,
    [post.id, assetType, body.asset_storage_key]
  );

  // Look up channels for this brand matching requested platforms
  const { rows: channels } = await db.query(
    `SELECT * FROM channels WHERE brand_id=$1 AND is_active=true AND platform=ANY($2::platform_enum[])`,
    [body.brand_id, body.platforms]
  );

  for (const ch of channels) {
    let captionOverride: string | null = null;
    if (ch.platform === "facebook" && body.caption_fb) captionOverride = body.caption_fb;
    if (ch.platform === "instagram" && body.caption_ig) captionOverride = body.caption_ig;

    await db.query(
      `INSERT INTO post_targets (post_id, channel_id, caption_override, status)
       VALUES ($1, $2, $3, 'pending')`,
      [post.id, ch.id, captionOverride]
    );
  }

  return c.json({ postId: post.id }, 201);
});

export default quickPostRouter;
