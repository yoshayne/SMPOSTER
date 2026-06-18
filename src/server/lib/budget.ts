import { db } from "../db";

// Cost estimates per asset type (USD). Video costs vary by model — use worst-case for the estimate.
const COST_ESTIMATES: Record<string, number> = {
  image: 0.0,        // Gemini image gen currently free
  reel_cheap: 0.45,  // Seedance ~$0.09/sec × 5s
  reel_standard: 0.50, // Kling 3.0 ~$0.10/sec × 5s
  reel_premium: 1.25,  // Veo 3.1 — higher estimate
  story_cheap: 0.45,
  story_standard: 0.50,
  story_premium: 1.25,
};

export function estimateAssetCost(assetType: string, qualityTier: string): number {
  if (assetType === "image") return COST_ESTIMATES.image;
  return COST_ESTIMATES[`${assetType}_${qualityTier}`] ?? COST_ESTIMATES[`${assetType}_standard`] ?? 0;
}

export async function getCurrentSpend(): Promise<number> {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const { rows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost), 0)::text as total
     FROM post_assets
     WHERE cost IS NOT NULL AND created_at >= $1`,
    [firstOfMonth]
  );
  return parseFloat(rows[0].total);
}

export async function getBudgetCap(): Promise<number | null> {
  const { rows } = await db.query<{ monthly_budget_cap: string | null }>(
    "SELECT monthly_budget_cap FROM settings WHERE id=1"
  );
  const cap = rows[0]?.monthly_budget_cap;
  return cap != null ? parseFloat(cap) : null;
}

export async function checkBudget(estimatedCost: number): Promise<{ allowed: boolean; cap: number | null; spend: number; remaining: number | null }> {
  const [cap, spend] = await Promise.all([getBudgetCap(), getCurrentSpend()]);
  if (cap == null) return { allowed: true, cap: null, spend, remaining: null };
  const remaining = cap - spend;
  return { allowed: estimatedCost <= remaining, cap, spend, remaining };
}
