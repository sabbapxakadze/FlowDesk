import { useQuery } from "@tanstack/react-query";
import { fetchLabels } from "./fetchLabels";
import { labelKeys } from "./queryKeys";

export function useLabels(organizationId: string) {
  return useQuery({
    queryKey: labelKeys.list(organizationId),
    queryFn: () => fetchLabels(organizationId),
  });
}
