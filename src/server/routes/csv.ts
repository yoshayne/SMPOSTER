import { Hono } from "hono";
import { db as pool } from "../db";
import { parseCsv } from "../lib/csvParser";

const csvRouter = new Hono();

csvRouter.get("/csv/template", (c) => {
  const csv = [
    "brand,copy,scheduled_date,scheduled_time,image,reel,story,facebook,instagram,tiktok,quality_tier,caption_fb,caption_ig,caption_tiktok",
    "My Brand,Example caption for this post,2025-01-15,14:30,TRUE,FALSE,FALSE,TRUE,TRUE,FALSE,standard,,,",
  ].join("\n");

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", 'attachment; filename="smposter-template.csv"');
  return c.body(csv);
});

csvRouter.post("/csv/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || typeof file === "string") {
    return c.json({ error: "No file uploaded" }, 400);
  }

  const arrayBuffer = await (file as File).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { rows, errors } = await parseCsv(buffer);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    // Look up brand by name (case-insensitive)
    const brandRes = await pool.query(
      "SELECT id FROM brands WHERE lower(name) = lower($1)",
      [row.brand]
    );

    if (brandRes.rows.length === 0) {
      errors.push({ row: -1, message: `Brand '${row.brand}' not found` });
      skipped++;
      continue;
    }

    const brandId = brandRes.rows[0].id;

    // Insert post
    const postRes = await pool.query(
      "INSERT INTO posts (brand_id, copy, scheduled_at, status, quality_tier, source) VALUES ($1,$2,$3,'draft',$4,'csv') RETURNING id",
      [brandId, row.copy, row.scheduled_at, row.quality_tier]
    );
    const postId = postRes.rows[0].id;

    // Insert post_assets
    const assetTypes: string[] = [];
    if (row.image) assetTypes.push("image");
    if (row.reel) assetTypes.push("reel");
    if (row.story) assetTypes.push("story");

    for (const assetType of assetTypes) {
      await pool.query(
        "INSERT INTO post_assets (post_id, asset_type, generation_status) VALUES ($1,$2,'pending')",
        [postId, assetType]
      );
    }

    // Look up active channels for the brand
    const requestedPlatforms: string[] = [];
    if (row.facebook) requestedPlatforms.push("facebook");
    if (row.instagram) requestedPlatforms.push("instagram");
    if (row.tiktok) requestedPlatforms.push("tiktok");

    if (requestedPlatforms.length > 0) {
      const channelsRes = await pool.query(
        "SELECT id, platform FROM channels WHERE brand_id=$1 AND platform=ANY($2) AND is_active=true",
        [brandId, requestedPlatforms]
      );

      for (const channel of channelsRes.rows) {
        let captionOverride: string | null = null;
        if (channel.platform === "facebook") captionOverride = row.caption_fb;
        else if (channel.platform === "instagram") captionOverride = row.caption_ig;
        else if (channel.platform === "tiktok") captionOverride = row.caption_tiktok;

        await pool.query(
          "INSERT INTO post_targets (post_id, channel_id, caption_override, status) VALUES ($1, $2, $3, 'pending')",
          [postId, channel.id, captionOverride]
        );
      }
    }

    imported++;
  }

  return c.json({ imported, skipped, errors });
});

export default csvRouter;
