export const invitationKeys = {
  all: ["organizations", "invitations"] as const,
  list: (organizationId: string) => [...invitationKeys.all, organizationId] as const,
};
