import { Hono } from "hono";
import { db as pool } from "../db";

const postsRouter = new Hono();

const POST_QUERY = `
  SELECT
    p.*,
    b.name as brand_name,
    json_agg(DISTINCT jsonb_build_object('id',pa.id,'asset_type',pa.asset_type,'generation_status',pa.generation_status,'storage_key',pa.storage_key)) FILTER (WHERE pa.id IS NOT NULL) as assets,
    json_agg(DISTINCT jsonb_build_object('id',pt.id,'channel_id',pt.channel_id,'status',pt.status,'caption_override',pt.caption_override)) FILTER (WHERE pt.id IS NOT NULL) as targets
  FROM posts p
  JOIN brands b ON b.id = p.brand_id
  LEFT JOIN post_assets pa ON pa.post_id = p.id
  LEFT JOIN post_targets pt ON pt.post_id = p.id
`;

postsRouter.get("/posts", async (c) => {
  const status = c.req.query("status");
  const brandId = c.req.query("brand_id");

  const conditions: string[] = [];
  const params: any[] = [];

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (brandId) {
    params.push(brandId);
    conditions.push(`p.brand_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `${POST_QUERY} ${where} GROUP BY p.id, b.name ORDER BY p.scheduled_at ASC`;

  const res = await pool.query(query, params);
  return c.json(res.rows);
});

postsRouter.get("/posts/:id", async (c) => {
  const id = c.req.param("id");
  const query = `${POST_QUERY} WHERE p.id = $1 GROUP BY p.id, b.name`;
  const res = await pool.query(query, [id]);
  if (res.rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(res.rows[0]);
});

export default postsRouter;
