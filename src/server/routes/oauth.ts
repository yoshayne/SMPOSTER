import { Hono } from "hono";
import { randomBytes } from "crypto";
import { db } from "../db";
import { encrypt } from "../lib/encrypt";
import { redis } from "../redis";

const oauth = new Hono();

oauth.get("/oauth/meta/start", async (c) => {
  const brandId = c.req.query("brand_id");
  if (!brandId) return c.json({ error: "brand_id required" }, 400);

  const { rows } = await db.query("SELECT id FROM brands WHERE id=$1", [brandId]);
  if (!rows.length) return c.json({ error: "Brand not found" }, 404);

  const state = randomBytes(32).toString("hex");
  await redis.set(`oauth_state:${state}`, brandId, "EX", 600);

  const scopes =
    "pages_manage_posts,pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish";
  const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI!);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  return c.redirect(url.toString());
});

oauth.get("/oauth/meta/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) return c.json({ error: "Missing code or state" }, 400);

  const brandId = await redis.get(`oauth_state:${state}`);
  if (!brandId) return c.json({ error: "Invalid or expired state" }, 400);

  // Exchange code for short-lived token
  const shortRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI!)}&code=${code}`
  );
  const shortData = (await shortRes.json()) as { access_token?: string; error?: unknown };
  if (!shortData.access_token) {
    return c.json({ error: "Failed to exchange code", detail: shortData.error }, 400);
  }

  // Exchange for long-lived token
  const longRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${shortData.access_token}`
  );
  const longData = (await longRes.json()) as { access_token?: string; error?: unknown };
  if (!longData.access_token) {
    return c.json({ error: "Failed to get long-lived token", detail: longData.error }, 400);
  }

  // Fetch pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username}&access_token=${longData.access_token}`
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; name: string; username: string };
    }>;
  };

  const pages = (pagesData.data ?? []).map((p) => ({
    page_id: p.id,
    page_name: p.name,
    page_access_token: p.access_token,
    ig_id: p.instagram_business_account?.id,
    ig_username: p.instagram_business_account?.username,
  }));

  const key = randomBytes(16).toString("hex");
  await redis.set(`oauth_pending:${key}`, JSON.stringify({ brand_id: brandId, pages }), "EX", 900);
  await redis.del(`oauth_state:${state}`);

  return c.redirect(`/settings?oauth_key=${key}`);
});

oauth.get("/oauth/meta/pending", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "key required" }, 400);

  const raw = await redis.get(`oauth_pending:${key}`);
  if (!raw) return c.json({ error: "Not found or expired" }, 404);

  const data = JSON.parse(raw) as {
    brand_id: string;
    pages: Array<{
      page_id: string;
      page_name: string;
      page_access_token: string;
      ig_id?: string;
      ig_username?: string;
    }>;
  };

  // Return without tokens
  return c.json({
    brand_id: data.brand_id,
    pages: data.pages.map(({ page_id, page_name, ig_id, ig_username }) => ({
      page_id,
      page_name,
      ig_id,
      ig_username,
    })),
  });
});

oauth.post("/oauth/meta/connect", async (c) => {
  const body = await c.req.json<{
    key: string;
    brand_id: number;
    selections: Array<{ page_id: string; include_ig: boolean }>;
  }>();

  const raw = await redis.get(`oauth_pending:${body.key}`);
  if (!raw) return c.json({ error: "Not found or expired" }, 404);

  const data = JSON.parse(raw) as {
    brand_id: string;
    pages: Array<{
      page_id: string;
      page_name: string;
      page_access_token: string;
      ig_id?: string;
      ig_username?: string;
    }>;
  };

  let connected = 0;
  for (const sel of body.selections) {
    const page = data.pages.find((p) => p.page_id === sel.page_id);
    if (!page) continue;

    const encToken = encrypt(page.page_access_token);

    // Upsert facebook channel
    await db.query(
      `INSERT INTO channels (brand_id, platform, external_id, access_token)
       VALUES ($1, 'facebook', $2, $3)
       ON CONFLICT (brand_id, platform, external_id)
       DO UPDATE SET access_token=EXCLUDED.access_token, is_active=true`,
      [body.brand_id, page.page_id, encToken]
    );
    connected++;

    // Upsert instagram channel if requested and linked
    if (sel.include_ig && page.ig_id) {
      await db.query(
        `INSERT INTO channels (brand_id, platform, external_id, access_token)
         VALUES ($1, 'instagram', $2, $3)
         ON CONFLICT (brand_id, platform, external_id)
         DO UPDATE SET access_token=EXCLUDED.access_token, is_active=true`,
        [body.brand_id, page.ig_id, encToken]
      );
      connected++;
    }
  }

  await redis.del(`oauth_pending:${body.key}`);
  return c.json({ connected });
});

export default oauth;
