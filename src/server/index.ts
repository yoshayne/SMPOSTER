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
import tiktokOauthRouter from "./routes/oauthTiktok";
import { startScheduler } from "./lib/scheduler";
import archiveRouter from "./routes/archive";
import { getCurrentSpend } from "./lib/budget";

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
app.route("/api", archiveRouter);
app.route("/api", tiktokOauthRouter);

// --- Settings ---

app.get("/api/settings", async (c) => {
  const { rows } = await db.query("SELECT * FROM settings WHERE id=1");
  const row = rows[0] ?? { id: 1, monthly_budget_cap: null, timezone: "America/New_York" };
  const current_spend = await getCurrentSpend();
  return c.json({ ...row, current_spend });
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

// --- Legal pages (Meta App Review requirements) ---

const LEGAL_STYLE = `
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:720px;margin:60px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}
  h1{font-size:28px;margin-bottom:4px}
  h2{font-size:18px;margin-top:36px}
  .meta{color:#666;font-size:14px;margin-bottom:32px}
  a{color:#2563eb}
`;

app.get("/privacy", (c) => c.html(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Privacy Policy — SMPoster</title><style>${LEGAL_STYLE}</style></head>
<body>
<h1>Privacy Policy</h1>
<p class="meta">Last updated: June 18, 2025</p>

<p>SMPoster is a private, single-user social media scheduling tool operated by Shayne. It is not a public service and does not collect data from third parties or the general public.</p>

<h2>What data is collected</h2>
<p>SMPoster stores only data that Shayne explicitly provides or authorizes:</p>
<ul>
  <li>Facebook Page and Instagram account access tokens, obtained via Meta's official OAuth flow, used solely to publish content on Shayne's own Pages and accounts.</li>
  <li>TikTok account access tokens, obtained via TikTok's official OAuth flow, used solely to publish content on Shayne's own TikTok account.</li>
  <li>Post copy, scheduled times, uploaded media, and generation prompts entered by Shayne.</li>
  <li>Engagement metrics (likes, comments, shares, reach) fetched from Meta's Graph API for Shayne's own published posts.</li>
</ul>

<h2>How data is used</h2>
<p>All collected data is used exclusively to operate SMPoster's scheduling and publishing features on behalf of Shayne. No data is sold, shared, or used for advertising.</p>

<h2>Data storage</h2>
<p>Data is stored in a private PostgreSQL database and object storage bucket hosted on Railway. Access tokens are encrypted at rest using AES-256-GCM.</p>

<h2>Third-party services</h2>
<p>SMPoster integrates with Meta (Facebook/Instagram), TikTok, Google Gemini, and fal.ai solely to provide its core scheduling and generation features. Each service's own privacy policy applies to data processed by that service.</p>

<h2>Data retention</h2>
<p>Data is retained for as long as the application is in use. Shayne may request deletion at any time — see the <a href="/data-deletion">Data Deletion</a> page.</p>

<h2>Contact</h2>
<p>Questions: <a href="mailto:creativedirectorshayne@gmail.com">creativedirectorshayne@gmail.com</a></p>
</body></html>`));

app.get("/terms", (c) => c.html(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Terms of Service — SMPoster</title><style>${LEGAL_STYLE}</style></head>
<body>
<h1>Terms of Service</h1>
<p class="meta">Last updated: June 18, 2025</p>

<p>SMPoster is a private, internal tool built and operated solely by Shayne ("the Operator") for personal social media scheduling and publishing. It is not available to the public and has no end-users other than the Operator.</p>

<h2>Acceptance</h2>
<p>By accessing or using SMPoster, you confirm that you are the Operator and that you agree to these terms. If you are not the Operator, you are not authorized to use this application.</p>

<h2>Permitted use</h2>
<p>SMPoster may be used only to schedule and publish content to social media accounts that the Operator owns or is expressly authorized to manage. Use of the application to publish content on behalf of accounts the Operator does not own or control is prohibited.</p>

<h2>Third-party platforms</h2>
<p>Use of SMPoster in connection with Facebook, Instagram, and TikTok is subject to those platforms' own terms of service. The Operator is responsible for ensuring that all content published through SMPoster complies with the applicable platform policies.</p>

<h2>AI-generated content</h2>
<p>SMPoster uses third-party AI services (Google Gemini, fal.ai) to generate images and video. The Operator is solely responsible for reviewing, approving, and publishing AI-generated content. The Operator must ensure generated content complies with all applicable laws and platform policies before publishing.</p>

<h2>No warranties</h2>
<p>SMPoster is provided as-is, without warranties of any kind. Uptime, availability, and accuracy of scheduling are not guaranteed.</p>

<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, the developer of SMPoster shall not be liable for any loss of data, missed posts, API errors, platform policy violations, or other damages arising from use of the application.</p>

<h2>Changes</h2>
<p>These terms may be updated at any time. Continued use of the application constitutes acceptance of the updated terms.</p>

<h2>Contact</h2>
<p><a href="mailto:creativedirectorshayne@gmail.com">creativedirectorshayne@gmail.com</a></p>
</body></html>`));

app.get("/data-deletion", (c) => c.html(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Data Deletion — SMPoster</title><style>${LEGAL_STYLE}</style></head>
<body>
<h1>Data Deletion</h1>
<p class="meta">Last updated: June 18, 2025</p>

<p>SMPoster is a private, single-user application. If you are the operator (Shayne) and wish to delete your data, follow the steps below.</p>

<h2>Revoking Meta permissions</h2>
<p>You can remove SMPoster's access to your Facebook Pages and Instagram accounts at any time:</p>
<ol>
  <li>Go to <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener">Facebook Settings → Apps and Websites</a>.</li>
  <li>Find <strong>SMPoster</strong> and click <strong>Remove</strong>.</li>
  <li>This immediately revokes all access tokens. SMPoster will no longer be able to publish to your Pages or Instagram accounts.</li>
</ol>

<h2>Revoking TikTok permissions</h2>
<ol>
  <li>Go to <a href="https://www.tiktok.com/setting/" target="_blank" rel="noopener">TikTok Settings → Security → Authorized Apps</a>.</li>
  <li>Find <strong>SMPoster</strong> and revoke access.</li>
</ol>

<h2>Deleting all stored data</h2>
<p>To delete all posts, media, tokens, and account data stored by SMPoster, contact:</p>
<p><a href="mailto:creativedirectorshayne@gmail.com">creativedirectorshayne@gmail.com</a></p>
<p>Data will be permanently deleted within 30 days of the request.</p>
</body></html>`));

// --- SPA fallback ---

app.get("*", (c) => {
  try {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const html = readFileSync(join(process.cwd(), "dist/client/index.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.html(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>SMPoster</title></head><body><div id="root"></div></body></html>`);
  }
});

const port = Number(process.env.PORT) || 3000;

runMigrations()
  .then(() => {
    console.log("Migrations complete");
    startWorker();
    console.log("Generation worker started");
    startScheduler();
    console.log(`SMPoster listening on port ${port}`);
    serve({ fetch: app.fetch, port });
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
