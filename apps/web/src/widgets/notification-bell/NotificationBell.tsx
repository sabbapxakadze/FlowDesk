import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Notification } from "../../entities/notification";
import {
  useLiveNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../../entities/notification";
import { describeEvent } from "../../entities/issue";
import { useAuth } from "../../shared/auth/useAuth";
import { EmptyState, Skeleton } from "../../shared/ui";

function NotificationRow({ notification, onSelect }: { notification: Notification; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-control)] px-3 py-2 text-left hover:bg-[var(--color-bg-page)]"
      >
        <p className="text-xs text-[var(--color-text-muted)]">
          {notification.projectKey}-{notification.issueNumber}
          {notification.readAt === null && (
            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent-500)]" />
          )}
        </p>
        <p className="text-sm">
          <span className="font-medium">{notification.event.actorName}</span>{" "}
          {describeEvent(notification.event)}
          {" — "}
          {notification.issueTitle}
        </p>
      </button>
    </li>
  );
}

/**
 * Fixed-position, globally mounted (App.tsx, alongside CommandPalette) —
 * same reasoning as the command palette: no persistent nav shell yet
 * (Phase 3.6 deferred that explicitly), so this is a minimal, honest
 * placeholder affordance, not a final nav treatment. Renders nothing
 * while logged out, same guard CommandPalette already uses.
 */
export function NotificationBell() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const organizationId = organization?.id ?? "";
  const { data: unreadCount } = useUnreadCount(organizationId);
  const { data: notificationList, isPending } = useNotifications(organizationId);
  const markRead = useMarkNotificationRead(organizationId);
  const markAllRead = useMarkAllNotificationsRead(organizationId);
  useLiveNotifications(organizationId);

  // Closes on outside click / Escape — a non-modal dropdown, not a
  // <dialog>: a notification panel shouldn't block the rest of the page
  // the way the command palette's modal search should.
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!organization) return null;

  function select(notification: Notification) {
    setIsOpen(false);
    if (notification.readAt === null) markRead.mutate(notification.id);
    navigate(`/projects/${notification.projectId}/issues/${notification.issueId}`);
  }

  const rows = notificationList ?? [];
  const count = unreadCount ?? 0;

  return (
    <div ref={panelRef} className="fixed top-4 right-4 z-40">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-sm hover:bg-[var(--color-bg-page)]"
      >
        🔔
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent-500)] px-1 text-xs font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 flex max-h-96 w-80 flex-col gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs text-[var(--color-text-link)] underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState>No notifications yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} onSelect={() => select(notification)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
