import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

/** Any number: the same one for everyone who runs migrations, so two servers starting together take turns. */
export const MIGRATION_LOCK_KEY = 726_514_001;

/**
 * Brings the database schema up to date (ADR 0046). Render's pre-deploy command is not available on the free plan, so the server does it
 * itself when it starts (`RUN_MIGRATIONS=true`), before it accepts any request. A session-level Postgres advisory lock makes two servers
 * that start at the same moment take turns instead of both applying the same migration. The folder is found relative to this file, which sits
 * the same distance from `apps/api/drizzle` whether it runs from `src/` (tsx) or `dist/` (built).
 */
export async function runMigrations(): Promise<void> {
  const lockConnection = await pool.connect();
  try {
    await lockConnection.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  } finally {
    await lockConnection.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    lockConnection.release();
  }
}
