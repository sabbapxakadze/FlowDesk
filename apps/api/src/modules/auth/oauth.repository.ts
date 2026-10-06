import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { oauthIdentities, users } from "../../db/schema/index.js";
import type { OAuthProviderName } from "../../lib/oauth/index.js";

export async function findIdentity(provider: OAuthProviderName, providerUserId: string) {
  const [row] = await db
    .select()
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, providerUserId)))
    .limit(1);
  return row;
}

export async function listIdentitiesForUser(userId: string) {
  return db
    .select({ provider: oauthIdentities.provider, email: oauthIdentities.email })
    .from(oauthIdentities)
    .where(eq(oauthIdentities.userId, userId))
    .orderBy(asc(oauthIdentities.createdAt));
}

export async function createIdentity(input: {
  userId: string;
  provider: OAuthProviderName;
  providerUserId: string;
  email: string;
}) {
  await db.insert(oauthIdentities).values(input);
}

/**
 * Disconnects a provider, but never the person's last way to sign in. The user row is locked (FOR UPDATE) while the
 * count is read and the row removed, so two disconnects pressed at the same moment cannot each see "another method
 * is left" and together remove both.
 */
export async function deleteIdentityKeepingOneMethod(
  userId: string,
  provider: OAuthProviderName,
): Promise<"removed" | "not_connected" | "last_method"> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).for("update");
    const identities = await tx.select({ provider: oauthIdentities.provider }).from(oauthIdentities).where(eq(oauthIdentities.userId, userId));
    if (!identities.some((i) => i.provider === provider)) return "not_connected";
    if (!user?.passwordHash && identities.length <= 1) return "last_method";
    await tx.delete(oauthIdentities).where(and(eq(oauthIdentities.userId, userId), eq(oauthIdentities.provider, provider)));
    return "removed";
  });
}
