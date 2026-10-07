import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
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
 *
 * `publicHome` is what a visitor sees at `/` instead of being sent to the login page.
 */
export function RequireAuth({ children, publicHome }: { children: ReactNode; publicHome?: ReactNode }) {
  const { user, isLoading, endedReason } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) {
    return null;
  }

  if (!user) {
    // The landing page (ADR 0043): only at `/`, and only for someone who was not signed in on this page load. A session
    // that ended, or a person who just logged out, goes to the login page as before.
    if (publicHome && !endedReason && pathname === "/") return publicHome;
    // When the session ended on its own, the login page says why (NavigationNotice reads `state.notice`).
    const notice = endedReason && endedReason !== "signed-out" ? SESSION_END_NOTICES[endedReason] : undefined;
    return <Navigate to="/login" replace state={notice ? { notice } : undefined} />;
  }

  return children;
}
