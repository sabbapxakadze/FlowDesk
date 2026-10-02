import argon2 from "argon2";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { sendInvitationEmail } from "../../lib/email.js";
import { broadcastOrganizationChanged } from "../../realtime/socket-server.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import * as authRepository from "../auth/auth.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import * as invitationsRepository from "./invitations.repository.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type InvitableRole = "admin" | "member" | "viewer";

// One message for every way a link can be unusable (unknown, used, revoked,
// expired): the person only needs to know to ask for a new one, and distinct
// messages would tell a stranger which tokens once existed.
const INVALID_INVITATION_ERROR = () =>
  new AppError("invalid_invitation", 400, "This invitation is invalid or has expired.");

// code and constraint live on err.cause (drizzle wraps the driver error), not on the
// top-level error; same helper shape as labels.service.ts.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

function toInvitationDto(row: {
  id: string;
  email: string;
  role: string;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    role: row.role as InvitableRole,
    invitedByName: row.invitedByName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

export async function listInvitations(organizationId: string) {
  const rows = await invitationsRepository.listOpen(organizationId);
  return rows.map(toInvitationDto);
}

export async function createInvitation(input: {
  organizationId: string;
  actorId: string;
  email: string;
  role: InvitableRole;
}) {
  const email = input.email.toLowerCase().trim();

  // Only people without an account can be invited (ADR 0024): the app supports one
  // organization per user. Saying so plainly is fine here; the caller is an owner
  // or admin of this organization, not an anonymous visitor.
  const existingUser = await authRepository.findUserByEmail(email);
  if (existingUser) {
    const membership = await organizationsRepository.findMembership(existingUser.id, input.organizationId);
    if (membership) {
      throw new AppError("already_member", 409, "This person is already a member of the organization.");
    }
    throw new AppError(
      "email_has_account",
      409,
      "This email already has a FlowDesk account. Inviting people who already have an account is not supported yet.",
    );
  }

  const token = generateOpaqueToken();
  let created;
  try {
    created = await invitationsRepository.create({
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.actorId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
  } catch (err) {
    if (isUniqueViolation(err, "invitations_one_open_per_email")) {
      throw new AppError("invitation_pending", 409, "This email has already been invited. Revoke that invitation to send a new one.");
    }
    throw err;
  }

  const [organization, inviter] = await Promise.all([
    organizationsRepository.findOrganizationById(input.organizationId),
    authRepository.findUserById(input.actorId),
  ]);
  const inviterName = inviter?.name ?? "Someone";

  // Not part of the database work above on purpose, like the verification email: a
  // flaky email provider must not be the reason an invitation cannot be created, and
  // the inviter always gets the link back to share by hand.
  await sendInvitationEmail({
    to: email,
    token,
    organizationName: organization?.name ?? "FlowDesk",
    inviterName,
    role: input.role,
  });

  broadcastOrganizationChanged(input.organizationId, { kind: "members" });

  return {
    data: toInvitationDto({ ...created, invitedByName: inviterName }),
    inviteUrl: `${env.APP_URL}/invite?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeInvitation(organizationId: string, invitationId: string) {
  const revoked = await invitationsRepository.revoke(organizationId, invitationId);
  if (!revoked) {
    throw new AppError("invitation_not_found", 404, "Invitation not found.");
  }
  broadcastOrganizationChanged(organizationId, { kind: "members" });
}

async function findUsableInvitation(token: string) {
  const invitation = await invitationsRepository.findByTokenHash(hashToken(token));
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    throw INVALID_INVITATION_ERROR();
  }
  return invitation;
}

export async function previewInvitation(token: string) {
  const invitation = await findUsableInvitation(token);
  return {
    organizationName: invitation.organizationName,
    inviterName: invitation.inviterName,
    email: invitation.email,
    role: invitation.role as InvitableRole,
  };
}

export async function acceptInvitation(input: { token: string; name: string; password: string }) {
  const invitation = await findUsableInvitation(input.token);

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  let result;
  try {
    result = await invitationsRepository.accept({
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      role: invitation.role as InvitableRole,
      email: invitation.email,
      name: input.name,
      passwordHash,
    });
  } catch (err) {
    // The email got an account between the invitation and now. The transaction
    // rolled back, so the invitation is still open.
    if (isUniqueViolation(err, "users_email_unique")) {
      throw new AppError("email_already_registered", 409, "An account with this email already exists.");
    }
    throw err;
  }
  if (!result) {
    // Lost a race with another accept or a revoke.
    throw INVALID_INVITATION_ERROR();
  }

  broadcastOrganizationChanged(invitation.organizationId, { kind: "members" });
  return result;
}
