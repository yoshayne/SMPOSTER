import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "./db";
import { redis } from "./redis";
import { s3 } from "./s3";
import { runMigrations } from "./migrate";
import brandsRouter from "./routes/brands";
import channelsRouter from "./routes/channels";
import oauthRouter from "./routes/oauth";
import kbRouter from "./routes/kb";
import csvRouter from "./routes/csv";
import postsRouter from "./routes/posts";
import generationRouter from "./routes/generation";
import postAssetsRouter from "./routes/postAssets";
import publishRouter from "./routes/publish";
import quickPostRouter from "./routes/quickPost";
import { startWorker } from "./workers/generationWorker";

const app = new Hono();

// --- Static files BEFORE API routes ---

app.use(
  "/*",
  serveStatic({ root: "./dist/client" })
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

// --- Routes ---

app.route("/api/brands", brandsRouter);
app.route("/api", channelsRouter);
app.route("/api", oauthRouter);
app.route("/api", kbRouter);
app.route("/api", csvRouter);
app.route("/api", postsRouter);
app.route("/api", generationRouter);
app.route("/api", postAssetsRouter);
app.route("/api", publishRouter);
app.route("/api", quickPostRouter);

// --- Settings ---

app.get("/api/settings", async (c) => {
  const { rows } = await db.query("SELECT * FROM settings WHERE id=1");
  return c.json(rows[0] ?? { id: 1, monthly_budget_cap: null, current_spend: 0, timezone: "America/New_York" });
});

app.put("/api/settings", async (c) => {
  const body = await c.req.json<{ monthly_budget_cap?: number }>();
  const { rows } = await db.query(
    `INSERT INTO settings (id, monthly_budget_cap) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET monthly_budget_cap=EXCLUDED.monthly_budget_cap
     RETURNING *`,
    [body.monthly_budget_cap ?? null]
  );
  return c.json(rows[0]);
});

// --- SPA fallback ---

app.get("*", (c) => {
  return c.html(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>SMPoster</title></head><body><div id="root"></div></body></html>`
  );
});

const port = Number(process.env.PORT) || 3000;

runMigrations()
  .then(() => {
    console.log("Migrations complete");
    startWorker();
    console.log("Generation worker started");
    console.log(`SMPoster listening on port ${port}`);
    serve({ fetch: app.fetch, port });
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
