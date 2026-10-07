import { describe, expect, it } from "vitest";
import { pool } from "./client.js";
import { MIGRATION_LOCK_KEY, runMigrations } from "./run-migrations.js";

/** The server updates its own database schema at start (ADR 0046). The test database is already migrated by test-setup, so these run against a current schema. */

describe("runMigrations", () => {
  it("is safe to run on an up-to-date database, again and again", async () => {
    // Why: every server start runs it; a restart with nothing new to apply must do nothing and not fail.
    await runMigrations();
    await runMigrations();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
    expect(rows[0].n).toBeGreaterThan(20);
  });

  it("two at the same moment take turns and both finish", async () => {
    // Why: two servers (a deploy overlapping the old one) starting together must not both apply the same migration.
    await Promise.all([runMigrations(), runMigrations(), runMigrations()]);
  });

  it("releases its lock, so the next start (or a manual run) is not blocked", async () => {
    // Why: a lock left behind would make every later start wait for ever.
    await runMigrations();
    const connection = await pool.connect(); // one connection for both calls: advisory locks belong to a connection
    try {
      const { rows } = await connection.query("SELECT pg_try_advisory_lock($1) AS got", [MIGRATION_LOCK_KEY]);
      expect(rows[0].got).toBe(true);
      await connection.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    } finally {
      connection.release();
    }
  });
});
