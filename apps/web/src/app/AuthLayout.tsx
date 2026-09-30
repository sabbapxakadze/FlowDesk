import { Link, Outlet } from "react-router";

/**
 * Layout route for the public auth pages (login, register, verify-email,
 * forgot/reset password), the same pattern as AppShell (ADR 0014): the
 * layout owns the brand and the centered card, each page renders its own
 * <main> inside it. Kept separate from AppShell because these pages are
 * reachable logged out and must never show the app navigation.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12 sm:justify-center">
      <Link
        to="/"
        className="mb-8 font-display text-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        FlowDesk
      </Link>
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-6 shadow-sm">
        <Outlet />
      </div>
    </div>
  );
}
