import { Hono } from "hono";
import { randomBytes } from "crypto";
import { db } from "../db";
import { encrypt } from "../lib/encrypt";
import { redis } from "../redis";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_URL = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name";

const app = new Hono();

app.get("/oauth/tiktok/start", async (c) => {
  const brandId = c.req.query("brand_id");
  if (!brandId) return c.json({ error: "brand_id required" }, 400);
  const { rows } = await db.query("SELECT id FROM brands WHERE id=$1", [brandId]);
  if (!rows.length) return c.json({ error: "Brand not found" }, 404);

  const state = randomBytes(32).toString("hex");
  await redis.set(`tiktok_state:${state}`, brandId, "EX", 600);

  const url = new URL(TIKTOK_AUTH_URL);
  url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
  url.searchParams.set("redirect_uri", process.env.TIKTOK_REDIRECT_URI!);
  url.searchParams.set("state", state);

  return c.redirect(url.toString());
});

app.get("/oauth/tiktok/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.json({ error: "Missing code or state" }, 400);

  const brandId = await redis.get(`tiktok_state:${state}`);
  if (!brandId) return c.json({ error: "Invalid or expired state" }, 400);
  await redis.del(`tiktok_state:${state}`);

  // Exchange code for access token
  const tokenResp = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    }),
  });
  const tokenData = (await tokenResp.json()) as {
    data?: { access_token?: string; open_id?: string; expires_in?: number };
    error?: { code?: string; message?: string };
  };

  if (!tokenResp.ok || tokenData.error?.code !== "ok") {
    const msg = tokenData.error?.message ?? "Token exchange failed";
    return c.redirect(`/settings?tiktok_error=${encodeURIComponent(msg)}`);
  }

  const accessToken = tokenData.data?.access_token!;
  const openId = tokenData.data?.open_id!;
  const expiresIn = tokenData.data?.expires_in ?? 86400;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Fetch user display name
  const userResp = await fetch(TIKTOK_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = (await userResp.json()) as { data?: { user?: { display_name?: string } } };
  const displayName = userData.data?.user?.display_name ?? openId;

  // Upsert tiktok channel
  await db.query(
    `INSERT INTO channels (brand_id, platform, external_id, access_token, token_expires_at, is_active)
     VALUES ($1, 'tiktok', $2, $3, $4, true)
     ON CONFLICT (brand_id, platform, external_id)
     DO UPDATE SET access_token=EXCLUDED.access_token, token_expires_at=EXCLUDED.token_expires_at, is_active=true`,
    [brandId, openId, encrypt(accessToken), expiresAt]
  );

  console.log(`TikTok connected: brand ${brandId} → ${displayName} (${openId})`);
  return c.redirect(`/settings?tiktok_connected=1`);
});

export default app;
