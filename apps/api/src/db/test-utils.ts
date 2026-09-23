import { sql } from "drizzle-orm";
import { db } from "./client.js";

/**
 * Truncates every app table. Call from beforeEach so tests never depend on
 * — or leak into — state left by another test. CASCADE handles the
 * projects -> organizations foreign key without needing table order.
 */
export async function resetDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE organizations, projects, users, organization_members, sessions, auth_tokens, issues, issue_events, labels, issue_labels RESTART IDENTITY CASCADE`,
  );
}
