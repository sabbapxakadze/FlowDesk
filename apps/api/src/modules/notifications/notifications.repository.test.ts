import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, notifications, organizations, projects, users } from "../../db/schema/index.js";
import * as issuesRepository from "../issues/issues.repository.js";
import * as notificationsRepository from "./notifications.repository.js";

async function seedOrgProjectUser(orgName: string, orgSlug: string, projectKey: string) {
  const [org] = await db.insert(organizations).values({ name: orgName, slug: orgSlug }).returning();
  if (!org) throw new Error("setup failed");
  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, name: `${orgName} Project`, key: projectKey })
    .returning();
  if (!project) throw new Error("setup failed");
  const [user] = await db
    .insert(users)
    .values({ email: `${orgSlug}@example.com`, passwordHash: "not-a-real-hash", name: "Test User" })
    .returning();
  if (!user) throw new Error("setup failed");
  return { org, project, user };
}

async function seedUser(email: string, name: string) {
  const [user] = await db.insert(users).values({ email, passwordHash: "not-a-real-hash", name }).returning();
  if (!user) throw new Error("setup failed");
  return user;
}

describe("notifications repository", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("createForIssueEvent", () => {
    it("notifies every distinct past participant except the current actor", async () => {
      const { org, project, user: reporter } = await seedOrgProjectUser("Org", "org", "PRJ");
      const commenterA = await seedUser("a@example.com", "A");
      const commenterB = await seedUser("b@example.com", "B");

      const issue = await issuesRepository.create({
        organizationId: org.id,
        projectId: project.id,
        title: "Issue",
        description: null,
        reporterId: reporter.id,
      });
      await issuesRepository.addComment({ issueId: issue.id, authorId: commenterA.id, body: "first" });
      // commenterA comments a second time — DISTINCT must still count them once.
      await issuesRepository.addComment({ issueId: issue.id, authorId: commenterA.id, body: "again" });

      // A fresh event, actored by commenterB, to fan out against the
      // three participants accumulated so far (reporter, commenterA x2).
      const notifiedUserIds = await db.transaction(async (tx) => {
        const [event] = await tx
          .insert(issueEvents)
          .values({ issueId: issue.id, actorId: commenterB.id, type: "issue.commented", payload: {} })
          .returning({ id: issueEvents.id });
        if (!event) throw new Error("setup failed");
        return notificationsRepository.createForIssueEvent(tx, {
          issueEventId: event.id,
          issueId: issue.id,
          excludeActorId: commenterB.id,
        });
      });

      expect(new Set(notifiedUserIds)).toEqual(new Set([reporter.id, commenterA.id]));
      expect(notifiedUserIds).not.toContain(commenterB.id);
    });
  });

  describe("listForUser / countUnread / markRead / markAllRead", () => {
    async function seedNotification(orgId: string, projectId: string, recipientId: string, actorId: string) {
      const issue = await issuesRepository.create({
        organizationId: orgId,
        projectId,
        title: "Notified issue",
        description: null,
        reporterId: recipientId,
      });
      await issuesRepository.addComment({ issueId: issue.id, authorId: actorId, body: "hi" });
      return issue;
    }

    it("lists only the requesting user's notifications within their own org", async () => {
      const a = await seedOrgProjectUser("Org A", "org-a", "AAA");
      const otherUserInA = await seedUser("other-a@example.com", "Other A");
      await seedNotification(a.org.id, a.project.id, a.user.id, otherUserInA.id);

      const b = await seedOrgProjectUser("Org B", "org-b", "BBB");
      const otherUserInB = await seedUser("other-b@example.com", "Other B");
      await seedNotification(b.org.id, b.project.id, b.user.id, otherUserInB.id);

      const listA = await notificationsRepository.listForUser(a.org.id, a.user.id);
      expect(listA).toHaveLength(1);
      expect(listA[0]?.issueTitle).toBe("Notified issue");
      expect(listA[0]?.eventActorName).toBe("Other A");

      const listB = await notificationsRepository.listForUser(b.org.id, b.user.id);
      expect(listB).toHaveLength(1);
    });

    it("counts only unread notifications", async () => {
      const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
      const other = await seedUser("other@example.com", "Other");
      await seedNotification(org.id, project.id, user.id, other.id);
      await seedNotification(org.id, project.id, user.id, other.id);

      expect(await notificationsRepository.countUnread(org.id, user.id)).toBe(2);

      const [first] = await notificationsRepository.listForUser(org.id, user.id);
      if (!first) throw new Error("expected a notification");
      await notificationsRepository.markRead(user.id, first.id);

      expect(await notificationsRepository.countUnread(org.id, user.id)).toBe(1);
    });

    it("markRead reports not_found for another user's notification", async () => {
      const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
      const other = await seedUser("other@example.com", "Other");
      await seedNotification(org.id, project.id, user.id, other.id);
      const [notification] = await notificationsRepository.listForUser(org.id, user.id);
      if (!notification) throw new Error("expected a notification");

      const result = await notificationsRepository.markRead(other.id, notification.id);

      expect(result).toEqual({ status: "not_found" });
      expect(await notificationsRepository.countUnread(org.id, user.id)).toBe(1);
    });

    it("markAllRead clears every unread notification for that user, scoped to their org", async () => {
      const { org, project, user } = await seedOrgProjectUser("Org", "org", "PRJ");
      const other = await seedUser("other@example.com", "Other");
      await seedNotification(org.id, project.id, user.id, other.id);
      await seedNotification(org.id, project.id, user.id, other.id);
      await seedNotification(org.id, project.id, user.id, other.id);

      await notificationsRepository.markAllRead(org.id, user.id);

      expect(await notificationsRepository.countUnread(org.id, user.id)).toBe(0);
      const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id));
      expect(rows.every((r) => r.readAt !== null)).toBe(true);
    });
  });
});
