import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { Pool } from "pg";
import Redis from "ioredis";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import path from "path";

const app = new Hono();

// --- Connections ---

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true });
redis.connect().catch(() => {});

const s3 = new S3Client({
  endpoint: process.env.BUCKET_ENDPOINT_URL,
  region: process.env.BUCKET_REGION || "auto",
  credentials: {
    accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

// --- Static files BEFORE API routes ---

app.use(
  "/*",
  serveStatic({
    root: path.join(__dirname, "../../dist/client"),
  })
);

// --- API ---

app.get("/api/health", async (c) => {
  const status = { ok: true, db: false, redis: false, bucket: false };

  try {
    await db.query("SELECT 1");
    status.db = true;
  } catch {}

  try {
    await redis.ping();
    status.redis = true;
  } catch {}

  try {
    await s3.send(new HeadBucketCommand({ Bucket: process.env.BUCKET_NAME! }));
    status.bucket = true;
  } catch {}

  status.ok = status.db && status.redis && status.bucket;
  return c.json(status, status.ok ? 200 : 503);
});

// --- SPA fallback ---

app.get("*", (c) => {
  return c.html(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>SMPoster</title></head><body><div id="root"></div></body></html>`
  );
});

const port = Number(process.env.PORT) || 3000;
console.log(`SMPoster listening on port ${port}`);
serve({ fetch: app.fetch, port });
