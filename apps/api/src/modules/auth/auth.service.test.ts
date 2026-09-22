import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { organizationMembers, organizations, users } from "../../db/schema/index.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";

/**
 * Runs against real Postgres (flowdesk_test), not a mock — the thing worth
 * proving is that the transaction in auth.repository.ts actually behaves
 * like a transaction: either all three rows exist, or none of them do.
 */
describe("auth service — register", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates exactly one user, one organization, and one owner membership", async () => {
    const { user, organization } = await authService.register({
      email: "Test@Example.com",
      password: "password123",
      name: "Test User",
      organizationName: "Test Org",
    });

    // Email is normalized to lowercase before storage.
    expect(user.email).toBe("test@example.com");
    expect(organization.slug).toBe("test-org");

    const allUsers = await db.select().from(users);
    const allOrgs = await db.select().from(organizations);
    const allMembers = await db.select().from(organizationMembers);

    expect(allUsers).toHaveLength(1);
    expect(allOrgs).toHaveLength(1);
    expect(allMembers).toHaveLength(1);
    expect(allMembers[0]).toMatchObject({
      userId: user.id,
      organizationId: organization.id,
      role: "owner",
    });
  });

  it("rejects a duplicate email and leaves no partial rows behind", async () => {
    await authService.register({
      email: "dup@example.com",
      password: "password123",
      name: "First",
      organizationName: "First Org",
    });

    await expect(
      authService.register({
        email: "dup@example.com",
        password: "password123",
        name: "Second",
        organizationName: "Second Org",
      }),
    ).rejects.toThrow(AppError);

    // The failed second attempt must not have left a second organization
    // or a second user behind — only the first registration's rows exist.
    const allUsers = await db.select().from(users);
    const allOrgs = await db.select().from(organizations);

    expect(allUsers).toHaveLength(1);
    expect(allOrgs).toHaveLength(1);
  });

  it("gives two organizations with the same name different slugs", async () => {
    const first = await authService.register({
      email: "a@example.com",
      password: "password123",
      name: "A",
      organizationName: "Shared Name",
    });
    const second = await authService.register({
      email: "b@example.com",
      password: "password123",
      name: "B",
      organizationName: "Shared Name",
    });

    expect(first.organization.slug).not.toBe(second.organization.slug);
  });
});
