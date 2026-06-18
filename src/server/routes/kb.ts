import { Hono } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { s3 } from "../s3";

const kbRouter = new Hono();

// GET /api/brands/:brandId/kb — list assets
kbRouter.get("/brands/:brandId/kb", async (c) => {
  const brandId = Number(c.req.param("brandId"));
  const { rows } = await db.query(
    "SELECT * FROM knowledge_base_assets WHERE brand_id=$1 ORDER BY created_at DESC",
    [brandId]
  );
  return c.json(rows);
});

// POST /api/brands/:brandId/kb — upload asset
kbRouter.post("/brands/:brandId/kb", async (c) => {
  const brandId = Number(c.req.param("brandId"));

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const notes = (formData.get("notes") as string) || "";

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return c.json({ error: "File exceeds 50MB limit" }, 400);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
  const videoExts = ["mp4", "mov", "webm"];

  let kind: string;
  if (imageExts.includes(ext)) {
    kind = "image";
  } else if (videoExts.includes(ext)) {
    kind = "video";
  } else {
    return c.json({ error: "Unsupported file type" }, 400);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const storageKey = `kb/${brandId}/${Date.now()}-${sanitizedName}`;

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

  const { rows } = await db.query(
    `INSERT INTO knowledge_base_assets (brand_id, kind, storage_key, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [brandId, kind, storageKey, notes]
  );

  return c.json(rows[0], 201);
});

// GET /api/kb/:id/url — presigned URL
kbRouter.get("/kb/:id/url", async (c) => {
  const id = Number(c.req.param("id"));
  const { rows } = await db.query(
    "SELECT * FROM knowledge_base_assets WHERE id=$1",
    [id]
  );
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

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

// DELETE /api/kb/:id
kbRouter.delete("/kb/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { rows } = await db.query(
    "SELECT * FROM knowledge_base_assets WHERE id=$1",
    [id]
  );
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: rows[0].storage_key,
    })
  );

  await db.query("DELETE FROM knowledge_base_assets WHERE id=$1", [id]);

  return c.json({ ok: true });
});

export default kbRouter;
