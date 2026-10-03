export const profileKeys = {
  all: ["organizations", "profiles"] as const,
  detail: (organizationId: string, userId: string) => [...profileKeys.all, organizationId, userId] as const,
  activity: (organizationId: string, userId: string) =>
    [...profileKeys.all, organizationId, userId, "activity"] as const,
};
