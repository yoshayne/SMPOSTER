import { Hono } from "hono";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db";
import { s3 } from "../s3";
import { buildImagePrompt } from "../lib/imagePrompt";

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

// POST /api/quick-post/generate-image — generate image with Gemini and store in bucket
quickPostRouter.post("/quick-post/generate-image", async (c) => {
  const body = await c.req.json<{ copy: string; style_instructions?: string }>();
  if (!body.copy) return c.json({ error: "copy is required" }, 400);
  if (!process.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY not configured" }, 500);

  const onImageText = (body as any).on_image_text as string | undefined;
  const prompt = buildImagePrompt({
    copy: body.copy,
    onImageText: onImageText || null,
    styleInstructions: body.style_instructions,
  });

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] } as any,
  });

  const imagePart = result.response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData
  );
  if (!imagePart?.inlineData) return c.json({ error: "No image returned from Gemini" }, 500);

  const buffer = Buffer.from(imagePart.inlineData.data, "base64");
  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  const storageKey = `quick-post/generated-${Date.now()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return c.json({ storage_key: storageKey, mime_type: mimeType });
});

// GET /api/quick-post/asset-url?key=... — presigned URL for preview
quickPostRouter.get("/quick-post/asset-url", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "key required" }, 400);
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.BUCKET_NAME!, Key: key }), { expiresIn: 3600 });
  return c.json({ url });
});

// POST /api/quick-post — create the post
quickPostRouter.post("/quick-post", async (c) => {
  const body = await c.req.json<{
    brand_id: number;
    asset_storage_key: string;
    asset_type: string;
    copy: string;
    on_image_text?: string;
    scheduled_at: string;
    status?: string;
    caption_fb?: string;
    caption_ig?: string;
    platforms: string[];
  }>();

  const status = body.status ?? "approved";

  const { rows: postRows } = await db.query(
    `INSERT INTO posts (brand_id, copy, on_image_text, scheduled_at, status, quality_tier, source)
     VALUES ($1, $2, $3, $4, $5, 'standard', 'manual')
     RETURNING *`,
    [body.brand_id, body.copy, body.on_image_text ?? null, body.scheduled_at, status]
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
