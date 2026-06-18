import { db } from "./db";
import { migrations } from "./migrations/index";

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id serial PRIMARY KEY,
      name text UNIQUE NOT NULL,
      applied_at timestamptz DEFAULT now()
    )
  `);
  for (const m of migrations) {
    const { rows } = await db.query("SELECT 1 FROM migrations WHERE name=$1", [m.name]);
    if (rows.length === 0) {
      console.log(`Running migration: ${m.name}`);
      await db.query(m.sql);
      await db.query("INSERT INTO migrations(name) VALUES($1)", [m.name]);
    }
  }
}
