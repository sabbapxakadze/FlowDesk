import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Direct database access for test setup only (never for assertions about what
 * the user sees: those go through the browser). Connects to the SAME database
 * the e2e API uses, flowdesk_test.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../../apps/api/.env", import.meta.url)));
} catch {
  // fine if TEST_DATABASE_URL is already in the environment
}

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must be set to run e2e tests");
}

const pool = new pg.Pool({ connectionString, max: 2 });

/** Same table list as the API tests' resetDatabase (apps/api/src/db/test-utils.ts). */
export async function resetDatabase() {
  await pool.query(
    "TRUNCATE TABLE organizations, projects, users, organization_members, sessions, auth_tokens, issues, issue_events, labels, issue_labels, comments, sprints, notifications, attachments RESTART IDENTITY CASCADE",
  );
}

export async function closeDatabase() {
  await pool.end();
}
