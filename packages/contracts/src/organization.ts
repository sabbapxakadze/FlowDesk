import { z } from "zod";
import { invitableRoleSchema } from "./invitation.js";

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Organization = z.infer<typeof organizationSchema>;

// Phase 8.5 slice 2B: the people an issue can be assigned to. Email is shown to
// tell two people with the same name apart; every viewer is already a member of
// the same organization.
export const organizationMemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  /** Profile (ADR 0028): shown on cards and the hover card. */
  jobTitle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  /** When they joined the organization. */
  joinedAt: z.iso.datetime(),
});

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const listOrganizationMembersResponseSchema = z.object({
  data: z.array(organizationMemberSchema),
});

// Owner is never assignable: there is one owner per organization (ADR 0024).
export const updateMemberRoleRequestSchema = z.object({ role: invitableRoleSchema });
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export type ListOrganizationMembersResponse = z.infer<typeof listOrganizationMembersResponseSchema>;
