export const labelKeys = {
  all: ["organizations", "labels"] as const,
  list: (organizationId: string) => [...labelKeys.all, organizationId] as const,
};
