import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs once before this workspace's test files. Loads .env for
// TEST_DATABASE_URL, points DATABASE_URL at it (so every module that goes
// through config/env.ts — the repository under test included — talks to
// the test database, never dev), then applies migrations. migrate() is
// idempotent (drizzle tracks what's applied in __drizzle_migrations), so
// running it on every test run is safe and keeps the test schema current
// without a manual step.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // no .env file — fine if TEST_DATABASE_URL is already in the environment
}

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must be set to run integration tests — see apps/api/.env.example",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { db, pool } = await import("./client.js");

await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });

// Vitest keeps the process alive between test files in a worker; close the
// pool when the whole run ends so it doesn't hang.
process.on("exit", () => {
  void pool.end();
});
