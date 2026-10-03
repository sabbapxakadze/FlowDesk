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
    "TRUNCATE TABLE organizations, projects, users, organization_members, sessions, auth_tokens, issues, issue_events, labels, issue_labels, comments, sprints, notifications, attachments, invitations, audit_events RESTART IDENTITY CASCADE",
  );
}

/**
 * A second person in an organization, inserted directly (the invitation flow has
 * its own e2e test; most tests just need another member quickly): a new user that
 * reuses the existing user's password hash (so both log in with the same password,
 * with no hashing library needed here) and a membership in that user's organization.
 */
export async function addOrgMember(
  existingEmail: string,
  member: { email: string; name: string },
) {
  const { rowCount } = await pool.query(
    `WITH base AS (
       SELECT u.password_hash, m.organization_id
       FROM users u JOIN organization_members m ON m.user_id = u.id
       WHERE u.email = $1
       LIMIT 1
     ), new_user AS (
       INSERT INTO users (email, password_hash, name)
       SELECT $2, password_hash, $3 FROM base
       RETURNING id
     )
     INSERT INTO organization_members (organization_id, user_id, role)
     SELECT base.organization_id, new_user.id, 'member' FROM base, new_user`,
    [existingEmail, member.email, member.name],
  );
  if (rowCount !== 1)
    throw new Error(`No user ${existingEmail} to copy an organization from`);
}

export async function closeDatabase() {
  await pool.end();
}
