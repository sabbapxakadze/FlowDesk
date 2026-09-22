import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizationMembers, organizations, users } from "../../db/schema/index.js";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

export async function organizationSlugExists(slug: string): Promise<boolean> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org !== undefined;
}

/**
 * The three inserts — user, organization, owner membership — succeed or
 * fail together. Without the transaction, a failure after the user insert
 * already committed would leave a real account with no organization: a
 * broken login that can never actually do anything.
 */
export async function createUserWithOrganization(input: {
  email: string;
  passwordHash: string;
  name: string;
  organizationName: string;
  organizationSlug: string;
}) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash, name: input.name })
      .returning();
    if (!user) throw new Error("Failed to create user");

    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.organizationName, slug: input.organizationSlug })
      .returning();
    if (!organization) throw new Error("Failed to create organization");

    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    });

    return { user, organization };
  });
}
