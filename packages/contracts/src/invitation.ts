import { z } from "zod";
import { registerResponseSchema } from "./auth.js";

/**
 * Inviting people to an organization (Phase 8.5, collaborators slice A, ADR 0024).
 * An owner or admin invites an email address with a role. The invitee opens a link
 * and creates their account, which joins THIS organization instead of creating a new
 * personal one. Only people without an account can be invited for now (the app
 * supports one organization per user; see ADR 0024).
 */

// "owner" is deliberately not assignable: there is one owner per organization and
// transferring ownership is its own feature.
export const invitableRoleSchema = z.enum(["admin", "member", "viewer"]);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: invitableRoleSchema,
  invitedByName: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Pending but past its expiry: shown so it can be revoked or replaced. */
  expired: z.boolean(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationRequestSchema = z.object({
  // Trimmed first: an address pasted with a trailing space is a typo to forgive.
  email: z.string().trim().pipe(z.email()),
  role: invitableRoleSchema,
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/**
 * `inviteUrl` carries the raw token and is returned ONLY here: the server stores just
 * a hash of the token, so it cannot show the link again later.
 */
export const createInvitationResponseSchema = z.object({
  data: invitationSchema,
  inviteUrl: z.string(),
});
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export const listInvitationsResponseSchema = z.object({
  data: z.array(invitationSchema),
});
export type ListInvitationsResponse = z.infer<typeof listInvitationsResponseSchema>;

// The two public (no login) calls take the token in the body, not the URL, so it
// stays out of access logs.
export const previewInvitationRequestSchema = z.object({
  token: z.string().min(1, "Token is required"),
});
export type PreviewInvitationRequest = z.infer<typeof previewInvitationRequestSchema>;

export const previewInvitationResponseSchema = z.object({
  organizationName: z.string(),
  inviterName: z.string(),
  email: z.string(),
  role: invitableRoleSchema,
});
export type PreviewInvitationResponse = z.infer<typeof previewInvitationResponseSchema>;

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(1, "Token is required"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

// Same shape as registering: signing up does not log you in; you go to the login page.
export const acceptInvitationResponseSchema = registerResponseSchema;
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
