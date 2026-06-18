import { Hono } from "hono";
import { db } from "../db";

const brands = new Hono();

brands.get("/", async (c) => {
  const { rows } = await db.query(
    "SELECT id, name, style_instructions, created_at FROM brands ORDER BY created_at DESC"
  );
  return c.json(rows);
});

brands.post("/", async (c) => {
  const body = await c.req.json<{ name: string; style_instructions?: string }>();
  const { rows } = await db.query(
    "INSERT INTO brands (name, style_instructions) VALUES ($1, $2) RETURNING *",
    [body.name, body.style_instructions ?? null]
  );
  return c.json(rows[0], 201);
});

brands.get("/:id", async (c) => {
  const { rows } = await db.query(
    "SELECT id, name, style_instructions, created_at FROM brands WHERE id=$1",
    [c.req.param("id")]
  );
  if (!rows.length) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

brands.put("/:id", async (c) => {
  const body = await c.req.json<{ name?: string; style_instructions?: string }>();
  const { rows } = await db.query(
    "UPDATE brands SET name=COALESCE($1,name), style_instructions=COALESCE($2,style_instructions) WHERE id=$3 RETURNING *",
    [body.name ?? null, body.style_instructions ?? null, c.req.param("id")]
  );
  if (!rows.length) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

brands.delete("/:id", async (c) => {
  await db.query("DELETE FROM brands WHERE id=$1", [c.req.param("id")]);
  return c.json({ ok: true });
});

export default brands;
