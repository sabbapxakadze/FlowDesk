import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ApiError } from "../shared/api/client";
import { AuthProvider } from "../shared/auth/AuthContext";

/**
 * App-wide providers live here, not in main.tsx — this is the file that
 * grows as more providers (theme, auth context, ...) are added, without
 * main.tsx turning into a wrapper pyramid.
 *
 * The QueryClient is created inside useState (not as a module-level
 * constant) so each app instance gets its own client and cache — the
 * standard TanStack Query setup, and it matters once SSR or tests render
 * the app more than once in the same process.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A 4xx answer (not found, forbidden, bad request) will not change by
            // asking again, so do not retry it: the default (3 retries with backoff,
            // about 7 seconds) made a bad or deleted link show a skeleton for that
            // long before "not found". Network errors and 5xx still retry.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 3,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
