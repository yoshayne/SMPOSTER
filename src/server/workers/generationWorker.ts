import { Worker, Job } from "bullmq";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from "@fal-ai/client";
import { db } from "../db";
import { s3 } from "../s3";
import { bullConnectionOptions } from "../lib/queue";

export type GenerationJob = {
  postAssetId: number;
  postId: number;
  assetType: "image" | "reel" | "story";
  copy: string;
  styleInstructions: string;
  qualityTier: "cheap" | "standard" | "premium";
};

const VIDEO_MODELS: Record<string, string> = {
  cheap: "fal-ai/seedance-1-lite",
  standard: "fal-ai/kling-video/v2.1/standard/text-to-video",
  premium: "fal-ai/veo2",
};

async function generateImage(
  prompt: string
): Promise<{ buffer: Buffer; ext: string; cost: number }> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
  });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] } as any,
  });
  const imagePart = result.response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData
  );
  if (!imagePart?.inlineData) throw new Error("No image returned from Gemini");
  const buffer = Buffer.from(imagePart.inlineData.data, "base64");
  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  return { buffer, ext, cost: 0.0 };
}

async function generateVideo(
  prompt: string,
  tier: string
): Promise<{ buffer: Buffer; ext: string; cost: number }> {
  fal.config({ credentials: process.env.FAL_KEY });
  const modelId = VIDEO_MODELS[tier] ?? VIDEO_MODELS.standard;
  const result = await fal.subscribe(modelId, {
    input: { prompt, aspect_ratio: "9:16", duration: "5" },
    pollInterval: 5000,
  });
  const videoUrl = (result.data as any)?.video?.url;
  if (!videoUrl) throw new Error("No video URL returned from fal.ai");
  const resp = await fetch(videoUrl);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, ext: "mp4", cost: 0.1 };
}

async function processJob(job: Job<GenerationJob>): Promise<void> {
  const { postAssetId, postId, assetType, copy, styleInstructions, qualityTier } =
    job.data;

  await db.query(
    "UPDATE post_assets SET generation_status='generating' WHERE id=$1",
    [postAssetId]
  );

  const prompt = [
    "Create a social media image.",
    "CRITICAL SPELLING RULE: Any text rendered visually in the image MUST be spelled letter-for-letter exactly as it appears below. Do not alter, rearrange, or invent any words.",
    "",
    `Caption text (copy exactly, character for character):\n${copy}`,
    styleInstructions ? `\nStyle and visual direction:\n${styleInstructions}` : "",
  ].filter(Boolean).join("\n");

  let buffer: Buffer;
  let ext: string;
  let cost: number;
  let provider: string;
  let contentType: string;

  if (assetType === "image") {
    const res = await generateImage(prompt);
    buffer = res.buffer;
    ext = res.ext;
    cost = res.cost;
    provider = "gemini";
    contentType = ext === "jpg" ? "image/jpeg" : "image/png";
  } else {
    const res = await generateVideo(prompt, qualityTier);
    buffer = res.buffer;
    ext = res.ext;
    cost = res.cost;
    contentType = "video/mp4";
    if (qualityTier === "cheap") provider = "fal-seedance";
    else if (qualityTier === "premium") provider = "fal-veo";
    else provider = "fal-kling";
  }

  const storageKey = `generated/${postId}/${postAssetId}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
    })
  );

  await db.query(
    `UPDATE post_assets
     SET generation_status='ready', storage_key=$1, cost=$2, provider=$3
     WHERE id=$4`,
    [storageKey, cost, provider, postAssetId]
  );

  // Check if all assets for this post are ready
  const { rows } = await db.query(
    `SELECT COUNT(*) as total,
     COUNT(*) FILTER (WHERE generation_status='ready') as ready
     FROM post_assets WHERE post_id=$1`,
    [postId]
  );
  const total = Number(rows[0].total);
  const ready = Number(rows[0].ready);
  if (total > 0 && ready === total) {
    await db.query(
      "UPDATE posts SET status='pending_approval' WHERE id=$1 AND status='generating'",
      [postId]
    );
  }
}

export function startWorker(): void {
  const worker = new Worker<GenerationJob>(
    "generation",
    async (job: Job<GenerationJob>) => {
      try {
        await processJob(job);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[generation worker] job ${job.id} failed:`, msg);
        await db.query(
          "UPDATE post_assets SET generation_status='failed', error_message=$2 WHERE id=$1",
          [job.data.postAssetId, msg]
        );
        await db.query(
          "UPDATE posts SET status='failed' WHERE id=$1 AND status='generating'",
          [job.data.postId]
        );
        throw err;
      }
    },
    { connection: bullConnectionOptions, concurrency: 3 }
  );

  worker.on("completed", (job) => {
    console.log(`[generation worker] job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[generation worker] job ${job?.id} failed:`, err.message);
  });
}
