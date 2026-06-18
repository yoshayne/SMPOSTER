import { Hono } from "hono";
import { db } from "../db";

const channels = new Hono();

channels.get("/brands/:brandId/channels", async (c) => {
  const { rows } = await db.query(
    `SELECT id, brand_id, platform, external_id, is_active, token_expires_at, created_at
     FROM channels WHERE brand_id=$1 ORDER BY created_at DESC`,
    [c.req.param("brandId")]
  );
  return c.json(rows);
});

channels.delete("/channels/:id", async (c) => {
  await db.query("DELETE FROM channels WHERE id=$1", [c.req.param("id")]);
  return c.json({ ok: true });
});

export default channels;
