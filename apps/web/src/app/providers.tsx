import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
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
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
