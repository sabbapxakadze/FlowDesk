import { useQuery } from "@tanstack/react-query";
import { fetchAccount } from "./fetchAccount";
import { accountKeys } from "./queryKeys";

/** The signed-in person's private account details: email (and a pending change), whether it is verified, and the timezone. */
export function useAccount() {
  return useQuery({ queryKey: accountKeys.me, queryFn: fetchAccount });
}
