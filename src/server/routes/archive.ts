import { Hono } from "hono";
import { db } from "../db";
import { syncAnalytics } from "../lib/analytics";

const app = new Hono();

app.get("/archive", async (c) => {
  const q = c.req.query("q") || null;
  const brandId = c.req.query("brand_id") ? Number(c.req.query("brand_id")) : null;
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(50, Number(c.req.query("limit") || 20));
  const offset = (page - 1) * limit;

  const { rows } = await db.query(
    `SELECT
       p.id, p.copy, p.scheduled_at, p.status, p.quality_tier, p.source, p.created_at,
       b.name as brand_name,
       json_agg(DISTINCT jsonb_build_object(
         'id', pt.id, 'platform', c.platform, 'status', pt.status,
         'external_post_id', pt.external_post_id, 'posted_at', pt.posted_at,
         'likes', pt.likes, 'comments', pt.comments, 'shares', pt.shares,
         'views', pt.views, 'reach', pt.reach, 'last_synced_at', pt.last_synced_at
       )) FILTER (WHERE pt.id IS NOT NULL) as targets
     FROM posts p
     JOIN brands b ON b.id = p.brand_id
     LEFT JOIN post_targets pt ON pt.post_id = p.id
     LEFT JOIN channels c ON c.id = pt.channel_id
     WHERE p.status = 'posted'
       AND ($1::text IS NULL OR p.copy ILIKE '%' || $1 || '%' OR b.name ILIKE '%' || $1 || '%')
       AND ($2::int IS NULL OR p.brand_id = $2)
     GROUP BY p.id, b.name
     ORDER BY p.scheduled_at DESC
     LIMIT $3 OFFSET $4`,
    [q, brandId, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(DISTINCT p.id)::int as total
     FROM posts p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.status = 'posted'
       AND ($1::text IS NULL OR p.copy ILIKE '%' || $1 || '%' OR b.name ILIKE '%' || $1 || '%')
       AND ($2::int IS NULL OR p.brand_id = $2)`,
    [q, brandId]
  );

  return c.json({ posts: rows, total: countRows[0].total, page, limit });
});

app.post("/posts/:id/repost", async (c) => {
  const postId = Number(c.req.param("id"));
  const { rows: [orig] } = await db.query(
    `SELECT * FROM posts WHERE id=$1 AND status='posted'`,
    [postId]
  );
  if (!orig) return c.json({ error: "Post not found or not posted" }, 404);

  const tomorrow = new Date(Date.now() + 86400000);
  const { rows: [newPost] } = await db.query(
    `INSERT INTO posts (brand_id, copy, scheduled_at, status, quality_tier, source)
     VALUES ($1, $2, $3, 'draft', $4, 'manual') RETURNING id`,
    [orig.brand_id, orig.copy, tomorrow, orig.quality_tier]
  );

  const { rows: origAssets } = await db.query(
    `SELECT asset_type FROM post_assets WHERE post_id=$1`, [postId]
  );
  for (const a of origAssets) {
    await db.query(
      `INSERT INTO post_assets (post_id, asset_type, generation_status) VALUES ($1,$2,'pending')`,
      [newPost.id, a.asset_type]
    );
  }

  const { rows: origTargets } = await db.query(
    `SELECT channel_id, caption_override FROM post_targets WHERE post_id=$1`, [postId]
  );
  for (const t of origTargets) {
    await db.query(
      `INSERT INTO post_targets (post_id, channel_id, caption_override, status) VALUES ($1,$2,$3,'pending')`,
      [newPost.id, t.channel_id, t.caption_override]
    );
  }

  return c.json({ newPostId: newPost.id });
});

app.post("/analytics/sync", async (c) => {
  syncAnalytics().catch((err) => console.error("Manual analytics sync error:", err));
  return c.json({ ok: true });
});

export default app;
