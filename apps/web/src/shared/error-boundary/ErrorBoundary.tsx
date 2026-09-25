import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui";

/**
 * A class component because this is the one place in React's API a
 * function component genuinely can't do the job — there is no hook
 * equivalent for getDerivedStateFromError/componentDidCatch, still true
 * as of React 19. Catches render-time exceptions only (not TanStack
 * Query's isError, which is a data-fetching state this component knows
 * nothing about) — an unexpected thrown error would otherwise white-
 * screen the whole app with no recovery UI, which is what this replaces.
 *
 * Wrapped once around the routed content in App.tsx, not per-route: this
 * app uses the plain <BrowserRouter><Routes> JSX API, not
 * createBrowserRouter, so a per-route errorElement isn't available
 * without a bigger router migration — out of scope here.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Last-resort visibility for an error React's own render cycle just
    // caught — no server-side logging pipeline reaches the browser's
    // uncaught-render-error path, so console is the only sink here.
    console.error("Uncaught render error", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="text-[var(--color-text-muted)]">
            An unexpected error occurred. Reloading the page usually fixes it.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </main>
      );
    }

    return this.props.children;
  }
}
