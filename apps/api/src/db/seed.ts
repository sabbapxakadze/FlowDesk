import { db, pool } from "./client.js";
import { organizations, projects } from "./schema/index.js";

/**
 * Local dev seed data. Safe to run more than once — onConflictDoNothing
 * keyed on the unique slug/key means a re-run is a no-op, not a crash.
 * This is also the demo organization Phase 9's "log in as demo" flow will
 * point at.
 */
async function seed() {
  const [demoOrg] = await db
    .insert(organizations)
    .values({ name: "Demo Org", slug: "demo-org" })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  const org = demoOrg ?? (await db.query.organizations.findFirst({
    where: (fields, { eq }) => eq(fields.slug, "demo-org"),
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
