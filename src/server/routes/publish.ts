import { Hono } from "hono";
import { db } from "../db";
import { publishPost } from "../lib/publisher";

const publishRouter = new Hono();

// POST /api/posts/:id/publish
publishRouter.post("/posts/:id/publish", async (c) => {
  const postId = Number(c.req.param("id"));

  const { rows } = await db.query("SELECT * FROM posts WHERE id=$1", [postId]);
  if (!rows[0]) return c.json({ error: "Post not found" }, 404);
  if (rows[0].status !== "approved") {
    return c.json({ error: `Post must be approved before publishing (current: ${rows[0].status})` }, 400);
  }

  try {
    await publishPost(postId);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default publishRouter;
