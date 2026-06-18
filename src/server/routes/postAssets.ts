import { Hono } from "hono";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { s3 } from "../s3";

const postAssetsRouter = new Hono();

// GET /api/post-assets/:id/url — presigned URL for a generated asset
postAssetsRouter.get("/post-assets/:id/url", async (c) => {
  const id = Number(c.req.param("id"));
  const { rows } = await db.query(
    "SELECT * FROM post_assets WHERE id=$1",
    [id]
  );
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  if (!rows[0].storage_key) return c.json({ error: "No file stored yet" }, 404);

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: rows[0].storage_key,
    }),
    { expiresIn: 3600 }
  );

  return c.json({ url });
});

export default postAssetsRouter;
