import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { issueEvents, issues, organizationMembers, organizations, projects, users } from "./schema/index.js";

// Small deterministic PRNG (mulberry32): the same seed always yields the
// same history, so the chart looks the same every time it is rebuilt.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SeedEvent = { type: string; payload: Record<string, unknown>; at: number };
type Status = "todo" | "in_progress" | "done";

/**
 * ~100 issues with backdated history over the last 12 weeks, so the
 * Phase 8 charts have something real to show. Inserts issues and
 * issue_events directly with explicit created_at — the real repository
 * functions always stamp now(), and going through writeIssueEvent would
 * also fan out notifications. Deliberately includes the shapes the
 * analytics query must handle: moves through in_progress, status changes
 * made via issue.updated, later edits that resend an unchanged
 * status: done (must NOT count), and a few reopened issues (count
 * again). Skipped when the project already has issues, so re-running the
 * seed is a no-op. Timestamps are relative to when the seed runs.
 */
async function seedAnalyticsDemo(organizationId: string) {
  await db
    .insert(projects)
    .values({ organizationId, name: "Analytics Demo", key: "ANL" })
    .onConflictDoNothing({ target: [projects.organizationId, projects.key] });
  const demoProject = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, organizationId), eq(projects.key, "ANL")),
  });
  if (!demoProject) throw new Error("Failed to create or find the analytics demo project");

  const existing = await db.query.issues.findFirst({ where: eq(issues.projectId, demoProject.id) });
  if (existing) return;

  await db
    .insert(users)
    .values({ email: "analytics-demo@flowdesk.test", passwordHash: "not-a-real-hash", name: "Demo Teammate" })
    .onConflictDoNothing({ target: users.email });
  const demoUser = await db.query.users.findFirst({ where: eq(users.email, "analytics-demo@flowdesk.test") });
  if (!demoUser) throw new Error("Failed to create or find the analytics demo user");
  await db.insert(organizationMembers).values({ organizationId, userId: demoUser.id, role: "member" }).onConflictDoNothing();

  const rand = mulberry32(8);
  const DAY = 86_400_000;
  const now = Date.now();
  const issueRows: (typeof issues.$inferInsert)[] = [];
  const eventRows: (typeof issueEvents.$inferInsert)[] = [];

  for (let n = 1; n <= 100; n++) {
    const createdAt = now - (rand() * 84 + 0.5) * DAY;
    const title = `Demo issue ${n}`;
    const events: SeedEvent[] = [{ type: "issue.created", payload: { title }, at: createdAt }];
    let status: Status = "todo";
    let t = createdAt;

    // Adds an event some days after the last one; false once it would land in the future.
    const step = (minDays: number, maxDays: number, type: string, payload: Record<string, unknown>) => {
      const next = t + (minDays + rand() * (maxDays - minDays)) * DAY;
      if (next > now) return false;
      t = next;
      events.push({ type, payload, at: t });
      return true;
    };
    const moveTo = (to: Status) => {
      const from = status;
      if (step(0.5, 6, "issue.moved", { fromStatus: from, toStatus: to })) status = to;
      return status === to;
    };

    const roll = rand();
    if (roll >= 0.15) {
      if (rand() < 0.6) moveTo("in_progress");
      if (roll >= 0.3) {
        let reached: boolean;
        if (rand() < 0.3) {
          // Finished through the edit form: an issue.updated carrying status.
          reached = step(0.5, 8, "issue.updated", { status: "done" });
          if (reached) status = "done";
        } else {
          reached = moveTo("done");
        }
        if (reached && rand() < 0.25) {
          // Editing a done issue resends its unchanged status: must not count.
          step(1, 10, "issue.updated", { title: `${title} (edited)`, status: "done" });
        }
        if (reached && rand() < 0.1 && moveTo("in_progress")) moveTo("done");
      }
    }

    const id = randomUUID();
    issueRows.push({
      id,
      organizationId,
      projectId: demoProject.id,
      number: n,
      title,
      status,
      reporterId: demoUser.id,
      boardRank: String(n * 1000),
      createdAt: new Date(createdAt),
      updatedAt: new Date(t),
    });
    for (const e of events) {
      eventRows.push({ issueId: id, actorId: demoUser.id, type: e.type, payload: e.payload, createdAt: new Date(e.at) });
    }
  }

  await db.insert(issues).values(issueRows);
  await db.insert(issueEvents).values(eventRows);
  await db.update(projects).set({ nextIssueNumber: 101 }).where(eq(projects.id, demoProject.id));
  console.log(`Seeded ${issueRows.length} analytics demo issues (${eventRows.length} events) in project ANL.`);
}

/**
 * Local dev seed data. Safe to run more than once — onConflictDoNothing
 * keyed on the unique slug/key means a re-run is a no-op, not a crash.
 * This is also the demo organization Phase 9's "log in as demo" flow will
 * point at.
 */
async function seed() {
  // SEED_ORG_SLUG lets the demo data be seeded into an existing org (e.g. a
  // real account you can log in as) instead of the fixed demo-org.
  const slug = process.env.SEED_ORG_SLUG ?? "demo-org";
  const [demoOrg] = await db
    .insert(organizations)
    .values({ name: slug === "demo-org" ? "Demo Org" : slug, slug })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  const org = demoOrg ?? (await db.query.organizations.findFirst({
    where: (fields, { eq }) => eq(fields.slug, slug),
  }));

  if (!org) {
    throw new Error("Failed to create or find the demo organization");
  }

  await db
    .insert(projects)
    .values([
      { organizationId: org.id, name: "Website", key: "WEB" },
      { organizationId: org.id, name: "Backend API", key: "API" },
    ])
    .onConflictDoNothing({ target: [projects.organizationId, projects.key] });

  await seedAnalyticsDemo(org.id);

  console.log(`Seeded organization "${org.slug}" (${org.id}) with its projects.`);
}

seed()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
