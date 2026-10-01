import { z } from "zod";

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
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const listOrganizationMembersResponseSchema = z.object({
  data: z.array(organizationMemberSchema),
});

export type ListOrganizationMembersResponse = z.infer<typeof listOrganizationMembersResponseSchema>;
