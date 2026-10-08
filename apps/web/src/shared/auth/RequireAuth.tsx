import { useLayoutEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
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
    return <RedirectToLogin state={notice ? { notice } : undefined} />;
  }

  return children;
}

/**
 * Like `<Navigate to="/login" replace>`, but it redirects in a layout effect, so the login page is already rendered when the render that
 * dropped the user finishes. With the router's own `Navigate` (a passive effect) the redirect came one step later, after a log out's
 * View Transition had already taken its "after" picture, and the fade ended on a blank page.
 */
function RedirectToLogin({ state }: { state: { notice: string } | undefined }) {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    void navigate("/login", { replace: true, state });
  }, [navigate, state]);
  return null;
}
