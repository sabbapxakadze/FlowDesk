import { Navigate } from "react-router";
import { useAuth } from "../../shared/auth/useAuth";

/**
 * `/` has no content of its own anymore. It used to be Phase 0's health-check
 * page, which existed to prove one Zod schema validates on both sides of the
 * API; that is recorded in the roadmap and no longer needs a page. Waits for
 * the session check before deciding, for the same reason RequireAuth does.
 */
export function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? "/projects" : "/login"} replace />;
}
