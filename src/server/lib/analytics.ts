import { db } from "../db";
import { decrypt } from "./encrypt";

export async function syncAnalytics(): Promise<void> {
  const { rows } = await db.query<{
    id: number;
    external_post_id: string;
    platform: string;
    access_token: string;
  }>(`
    SELECT pt.id, pt.external_post_id, c.platform, c.access_token
    FROM post_targets pt
    JOIN channels c ON c.id = pt.channel_id
    WHERE pt.status = 'posted' AND pt.external_post_id IS NOT NULL
  `);

  let updated = 0;
  for (const target of rows) {
    try {
      const token = decrypt(target.access_token);
      let likes: number | null = null;
      let comments: number | null = null;
      let shares: number | null = null;
      let views: number | null = null;
      let reach: number | null = null;

      if (target.platform === "facebook") {
        const url = `https://graph.facebook.com/v20.0/${target.external_post_id}/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total,post_clicks&access_token=${token}`;
        const res = await fetch(url);
        const json = (await res.json()) as { data?: { name: string; values: { value: number | Record<string, number> }[] }[] };
        for (const item of json.data ?? []) {
          const val = item.values?.[0]?.value;
          if (item.name === "post_impressions") reach = Number(val);
          if (item.name === "post_engaged_users") views = Number(val);
          if (item.name === "post_reactions_by_type_total") {
            likes = typeof val === "object" ? Object.values(val as Record<string, number>).reduce((a, b) => a + b, 0) : Number(val);
          }
        }
      } else if (target.platform === "instagram") {
        const url = `https://graph.facebook.com/v20.0/${target.external_post_id}/insights?metric=likes,comments,shares,reach,impressions&access_token=${token}`;
        const res = await fetch(url);
        const json = (await res.json()) as { data?: { name: string; values: { value: number }[] }[] };
        for (const item of json.data ?? []) {
          const val = item.values?.[0]?.value ?? 0;
          if (item.name === "likes") likes = val;
          if (item.name === "comments") comments = val;
          if (item.name === "shares") shares = val;
          if (item.name === "reach") reach = val;
          if (item.name === "impressions") views = val;
        }
      }

      await db.query(
        `UPDATE post_targets SET likes=$1, comments=$2, shares=$3, views=$4, reach=$5, last_synced_at=NOW() WHERE id=$6`,
        [likes, comments, shares, views, reach, target.id]
      );
      updated++;
    } catch (err) {
      console.error(`Analytics sync failed for post_target ${target.id}:`, err);
    }
  }
  console.log(`Analytics sync complete: ${updated}/${rows.length} targets updated`);
}
