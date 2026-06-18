import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { s3 } from "../s3";
import { redis } from "../redis";
import { decrypt } from "./encrypt";

const GRAPH_API = "https://graph.facebook.com/v20.0";
const IG_RATE_LIMIT = 25;

async function getPresignedUrl(storageKey: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.BUCKET_NAME!, Key: storageKey }),
    { expiresIn: 3600 }
  );
}

async function checkIgRateLimit(igUserId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `ig_rate:${igUserId}:${today}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400);
  if (count > IG_RATE_LIMIT) {
    throw new Error(`Instagram rate limit reached (${IG_RATE_LIMIT}/day)`);
  }
}

async function publishToFacebook(
  pageId: string,
  accessToken: string,
  assetUrl: string,
  caption: string,
  assetType: string
): Promise<string> {
  let endpoint: string;
  let body: Record<string, string>;

  if (assetType === "image") {
    endpoint = `${GRAPH_API}/${pageId}/photos`;
    body = { url: assetUrl, message: caption, access_token: accessToken };
  } else {
    // reel or story → video
    endpoint = `${GRAPH_API}/${pageId}/videos`;
    body = { file_url: assetUrl, description: caption, access_token: accessToken };
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error?.message ?? `Facebook API error ${resp.status}`);
  }
  return String(data.id ?? data.post_id ?? "");
}

async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  assetUrl: string,
  caption: string,
  assetType: string
): Promise<string> {
  await checkIgRateLimit(igUserId);

  // Step 1: Create container
  const mediaType = assetType === "image" ? "IMAGE" : "REELS";
  const containerBody: Record<string, string> = {
    caption,
    access_token: accessToken,
  };
  if (assetType === "image") {
    containerBody.image_url = assetUrl;
  } else {
    containerBody.video_url = assetUrl;
    containerBody.media_type = mediaType;
  }

  const createResp = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(containerBody),
  });
  const createData: any = await createResp.json();
  if (!createResp.ok || createData.error) {
    throw new Error(createData.error?.message ?? `IG media create error ${createResp.status}`);
  }
  const containerId: string = createData.id;

  // Step 2: Poll until FINISHED
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    const pollData: any = await pollResp.json();
    const statusCode: string = pollData.status_code;
    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`IG container processing failed: ${statusCode}`);
    }
  }

  // Step 3: Publish
  const publishResp = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  const publishData: any = await publishResp.json();
  if (!publishResp.ok || publishData.error) {
    throw new Error(publishData.error?.message ?? `IG publish error ${publishResp.status}`);
  }
  return String(publishData.id ?? "");
}

const TIKTOK_API = "https://open.tiktokapis.com/v2";

async function publishToTiktok(
  openId: string,
  accessToken: string,
  assetUrl: string,
  caption: string
): Promise<string> {
  // Initialize direct post
  const initResp = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: "SELF_ONLY", // safe default; user can change in TikTok app
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: assetUrl,
      },
    }),
  });
  const initData = (await initResp.json()) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string };
  };
  if (!initResp.ok || initData.error?.code !== "ok") {
    throw new Error(initData.error?.message ?? `TikTok init error ${initResp.status}`);
  }
  const publishId = initData.data?.publish_id!;

  // Poll until PUBLISH_COMPLETE
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusResp = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const statusData = (await statusResp.json()) as {
      data?: { status?: string; publicaly_available_post_id?: string[] };
    };
    const status = statusData.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      return statusData.data?.publicaly_available_post_id?.[0] ?? publishId;
    }
    if (status === "FAILED") throw new Error("TikTok publish failed");
  }
  // Timed out but publish_id recorded
  return publishId;
}

export async function publishPost(postId: number): Promise<void> {
  // Fetch post with assets and targets+channels
  const { rows: postRows } = await db.query(
    "SELECT * FROM posts WHERE id=$1",
    [postId]
  );
  if (!postRows[0]) throw new Error("Post not found");
  const post = postRows[0];

  const { rows: assets } = await db.query(
    `SELECT * FROM post_assets WHERE post_id=$1 AND generation_status IN ('approved','ready')`,
    [postId]
  );

  const { rows: targets } = await db.query(
    `SELECT pt.*, ch.platform, ch.external_id, ch.access_token as encrypted_token
     FROM post_targets pt
     JOIN channels ch ON ch.id = pt.channel_id
     WHERE pt.post_id=$1 AND pt.status='pending' AND ch.is_active=true`,
    [postId]
  );

  // Pick primary asset per type
  function pickAsset(type: string) {
    return assets.find((a: any) => a.asset_type === type);
  }

  let allSucceeded = true;

  for (const target of targets) {
    const platform: string = target.platform;
    const externalId: string = target.external_id;
    const accessToken = decrypt(target.encrypted_token);
    const caption: string = target.caption_override || post.copy;

    try {
      // Determine which asset to use
      let asset: any;
      if (platform === "facebook") {
        asset = pickAsset("image") ?? pickAsset("reel") ?? pickAsset("story");
      } else if (platform === "instagram") {
        asset = pickAsset("reel") ?? pickAsset("story") ?? pickAsset("image");
      } else if (platform === "tiktok") {
        asset = pickAsset("reel") ?? pickAsset("story");
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      if (!asset?.storage_key) throw new Error("No approved asset available");

      const assetUrl = await getPresignedUrl(asset.storage_key);
      let externalPostId: string;

      if (platform === "facebook") {
        externalPostId = await publishToFacebook(externalId, accessToken, assetUrl, caption, asset.asset_type);
      } else if (platform === "instagram") {
        externalPostId = await publishToInstagram(externalId, accessToken, assetUrl, caption, asset.asset_type);
      } else {
        externalPostId = await publishToTiktok(externalId, accessToken, assetUrl, caption);
      }

      await db.query(
        `UPDATE post_targets
         SET status='posted', external_post_id=$1, posted_at=now(), error_message=null
         WHERE id=$2`,
        [externalPostId, target.id]
      );
    } catch (err: any) {
      console.error(`[publisher] target ${target.id} failed:`, err.message);
      await db.query(
        "UPDATE post_targets SET status='failed', error_message=$1 WHERE id=$2",
        [err.message, target.id]
      );
      allSucceeded = false;
    }
  }

  // Update post status
  const finalStatus = allSucceeded ? "posted" : "failed";
  await db.query(
    "UPDATE posts SET status=$1, updated_at=now() WHERE id=$2",
    [finalStatus, postId]
  );
}
