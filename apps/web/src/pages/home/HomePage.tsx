import { useEffect, useState } from "react";
import { Link } from "react-router";
import { healthResponseSchema, type HealthResponse } from "@flowdesk/contracts";
import { apiGet } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/useAuth";

/**
 * Plain useEffect + useState here on purpose — this is Phase 0's one job:
 * prove that a single Zod schema, defined once in @flowdesk/contracts,
 * type-checks and validates correctly on both the API side and this side.
 * The real data-fetching pattern (TanStack Query) starts in Phase 1.
 */
export function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    apiGet("/health", healthResponseSchema).then(setHealth).catch((err: Error) => {
      setError(err.message);
    });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">FlowDesk</h1>
      <p className="text-sm text-gray-500">Phase 0 — foundations</p>

      {/* Just enough to see the session is real — the silent refresh on
          load (AuthContext) is what makes "Logged in as" survive a page
          reload even though the access token itself lives only in memory. */}
      {isLoading && <p className="text-sm text-gray-400">Checking session…</p>}
      {!isLoading && user && (
        <p className="text-sm">
          Logged in as <span className="font-medium">{user.name}</span>{" "}
          <button onClick={logout} className="text-blue-600 underline">
            log out
          </button>
        </p>
      )}
      {!isLoading && !user && (
        <p className="text-sm">
          <Link to="/login" className="text-blue-600 underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link to="/register" className="text-blue-600 underline">
            register
          </Link>
        </p>
      )}

      {error && <p className="text-red-600">API error: {error}</p>}
      {!error && !health && <p className="text-gray-400">Checking API…</p>}
      {health && (
        <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm">
          <p>
            API status: <span className="font-medium">{health.status}</span>
          </p>
          <p>
            Service: <span className="font-medium">{health.service}</span>
          </p>
          <p>
            As of: <span className="font-medium">{health.timestamp}</span>
          </p>
        </div>
      )}
    </main>
  );
}
