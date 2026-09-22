import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./useAuth";

/**
 * Waits for isLoading before deciding — without that, this would redirect
 * to /login on every page load and then immediately bounce back once the
 * silent refresh (AuthContext) resolves a moment later. Not a full
 * loading skeleton, just enough to avoid that flash.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
