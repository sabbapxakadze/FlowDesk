import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./useAuth";

const SESSION_END_NOTICES = {
  expired: "Your session ended. Please log in again.",
  idle: "You were signed out because of inactivity.",
} as const;

/**
 * Waits for isLoading before deciding — without that, this would redirect
 * to /login on every page load and then immediately bounce back once the
 * silent refresh (AuthContext) resolves a moment later. Not a full
 * loading skeleton, just enough to avoid that flash.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, endedReason } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    // When the session ended on its own, the login page says why (NavigationNotice reads `state.notice`).
    const notice = endedReason ? SESSION_END_NOTICES[endedReason] : undefined;
    return <Navigate to="/login" replace state={notice ? { notice } : undefined} />;
  }

  return children;
}
