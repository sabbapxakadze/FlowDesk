import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu, X } from "lucide-react";
import { Outlet } from "react-router";
import { useAuth } from "../shared/auth/useAuth";
import { NotificationBell } from "../widgets/notification-bell";
import { Sidebar } from "../widgets/sidebar";
import { useLiveOrganizationUpdates } from "./useLiveOrganizationUpdates";

const DESKTOP_QUERY = "(min-width: 768px)";

// One layout is rendered at a time (not both, hidden with CSS): the bell
// subscribes to live notifications on mount, so mounting two would double
// every listener.
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/**
 * The layout route's element (App.tsx): navigation plus an <Outlet /> for
 * whichever page matched. Pages keep rendering their own <main>, so the
 * shell adds none. Wide screens get a fixed sidebar; narrow screens get a
 * slim top bar whose menu button opens the same sidebar as a drawer.
 */
export function AppShell() {
  const { organization } = useAuth();
  useLiveOrganizationUpdates(organization?.id ?? "");
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const open = drawerOpen && !isDesktop;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (isDesktop) {
    return (
      <div className="grid min-h-screen grid-cols-[232px_1fr]">
        <div className="sticky top-0 h-screen">
          <Sidebar actions={<NotificationBell panelAlign="left" />} />
        </div>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar)] px-3 py-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-sidebar-active)] hover:bg-[var(--color-bg-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="font-display text-xl text-[var(--color-text-sidebar-active)]">FlowDesk</span>
        <div className="ml-auto">
          <NotificationBell panelAlign="right" />
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          // A click on any link inside the drawer navigates, so close it.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw]">
            <Sidebar
              actions={
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  autoFocus
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-sidebar-active)] hover:bg-[var(--color-bg-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              }
            />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
