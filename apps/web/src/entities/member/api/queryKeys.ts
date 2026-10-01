export const memberKeys = {
  all: ["organizations", "members"] as const,
  list: (organizationId: string) => [...memberKeys.all, organizationId] as const,
};
