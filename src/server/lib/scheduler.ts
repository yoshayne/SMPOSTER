import cron from "node-cron";
import { db } from "../db";
import { publishPost } from "./publisher";
import { syncAnalytics } from "./analytics";

export function startScheduler(): void {
  // Every minute: fire approved posts whose scheduled_at has passed
  cron.schedule("* * * * *", async () => {
    try {
      const { rows } = await db.query<{ id: number }>(
        `SELECT id FROM posts WHERE status = 'approved' AND scheduled_at <= NOW()`
      );
      for (const row of rows) {
        const { rowCount } = await db.query(
          `UPDATE posts SET status='scheduled', updated_at=NOW() WHERE id=$1 AND status='approved'`,
          [row.id]
        );
        if (rowCount && rowCount > 0) {
          publishPost(row.id).catch((err) =>
            console.error(`publishPost(${row.id}) failed:`, err)
          );
        }
      }
    } catch (err) {
      console.error("Scheduler tick error:", err);
    }
  }, { timezone: "America/New_York" });

  // 3:00 AM Eastern daily: sync engagement analytics
  cron.schedule("0 3 * * *", async () => {
    console.log("Starting daily analytics sync");
    await syncAnalytics().catch((err) => console.error("Analytics sync error:", err));
  }, { timezone: "America/New_York" });

  console.log("Scheduler started (post publisher + daily analytics sync)");
}
