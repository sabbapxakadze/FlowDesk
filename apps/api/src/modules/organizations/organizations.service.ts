import { avatarUrlFor } from "../../lib/avatar-url.js";
import { AppError } from "../../shared/errors.js";
import { broadcastIssueChanged, broadcastOrganizationChanged } from "../../realtime/socket-server.js";
import * as organizationsRepository from "./organizations.repository.js";

export async function listMembers(organizationId: string) {
  const rows = await organizationsRepository.listMembers(organizationId);
  return rows.map(({ avatarKey, ...row }) => ({
    ...row,
    avatarUrl: avatarUrlFor(avatarKey),
    joinedAt: row.joinedAt.toISOString(),
  }));
}

type Actor = { userId: string; role: "owner" | "admin" | "member" | "viewer" };

/**
 * The rules for touching another person's membership (ADR 0024), shared by role change
 * and removal. The route already required manage_members (owner or admin).
 * - not a member of this organization: 404 (also what another organization's id gets)
 * - yourself: 403 (an owner leaving or demoting themselves would orphan the organization)
 * - the owner: 403 (exactly one owner; ownership transfer is a separate feature)
 */
async function loadTarget(organizationId: string, actor: Actor, targetUserId: string) {
  const target = await organizationsRepository.findMembership(targetUserId, organizationId);
  if (!target) throw new AppError("member_not_found", 404, "Member not found.");
  if (targetUserId === actor.userId) {
    throw new AppError("cannot_change_self", 403, "You cannot change your own membership.");
  }
  if (target.role === "owner") {
    throw new AppError("owner_protected", 403, "The owner's membership cannot be changed or removed.");
  }
  return target;
}

export async function changeMemberRole(input: {
  organizationId: string;
  actor: Actor;
  targetUserId: string;
  role: "admin" | "member" | "viewer";
}) {
  await loadTarget(input.organizationId, input.actor, input.targetUserId);
  await organizationsRepository.updateMemberRole(
    input.organizationId,
    input.targetUserId,
    input.role,
    input.actor.userId,
  );
  broadcastOrganizationChanged(input.organizationId, { kind: "members" });
}

export async function removeMember(input: { organizationId: string; actor: Actor; targetUserId: string }) {
  await loadTarget(input.organizationId, input.actor, input.targetUserId);
  const result = await organizationsRepository.removeMember({
    organizationId: input.organizationId,
    userId: input.targetUserId,
    actorId: input.actor.userId,
  });
  if (!result) throw new AppError("member_not_found", 404, "Member not found.");

  // After the commit, never inside it (same rule as every other broadcast).
  for (const issue of result.unassigned) broadcastIssueChanged(issue.projectId, issue.id);
  broadcastOrganizationChanged(input.organizationId, { kind: "members" });
}
