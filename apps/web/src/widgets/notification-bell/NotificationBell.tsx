import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router";
import type { Notification } from "../../entities/notification";
import {
  useLiveNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../../entities/notification";
import { describeEventFor } from "../../entities/issue";
import { useAuth } from "../../shared/auth/useAuth";
import { issuePath } from "../../shared/lib/paths";
import { Button, EmptyState, Skeleton, useAnimatedList, useExitPresence, useRowMotionProps, type RowState } from "../../shared/ui";

function NotificationRow({
  notification,
  onSelect,
  rowState,
  rowIndex,
}: {
  notification: Notification;
  onSelect: () => void;
  rowState: RowState;
  rowIndex: number;
}) {
  const unread = notification.readAt === null;
  const { user } = useAuth();
  const { ref: rowRef, className: rowClass, style: rowStyle } = useRowMotionProps<HTMLLIElement>(rowState, rowIndex);
  return (
    <li ref={rowRef} style={rowStyle} className={rowClass}>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-control)] px-3 py-2 text-left hover:bg-[var(--color-bg-page)]"
      >
        <p className="text-xs text-[var(--color-text-muted)]">
          {notification.projectKey}-{notification.issueNumber}
          {notification.readAt === null && (
            <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--color-accent-600)]" />
          )}
        </p>
        <p
          className={`text-sm ${
            unread ? "font-medium text-[var(--color-text-default)]" : "text-[var(--color-text-muted)]"
          }`}
        >
          <span className="font-medium">{notification.event.actorName}</span>{" "}
          {describeEventFor(notification.event, user?.id)}
          {" — "}
          {notification.issueTitle}
        </p>
      </button>
    </li>
  );
}

/**
 * Placed by the navigation shell (app/AppShell.tsx): it used to be a
 * fixed top-right button because there was no shell, and it overlapped page
 * links. It is now an ordinary inline element styled for the dark shell
 * (sidebar tokens), and the caller says which side its dropdown opens
 * toward so it stays on screen from either the sidebar or the mobile top
 * bar. Renders nothing while logged out.
 */
export function NotificationBell({ panelAlign = "left" }: { panelAlign?: "left" | "right" }) {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  // The dropdown fades out on close (it stays mounted for that); closing itself is immediate.
  const dropdown = useExitPresence(isOpen, 120);
  const panelRef = useRef<HTMLDivElement>(null);

  const organizationId = organization?.id ?? "";
  const { data: unreadCount } = useUnreadCount(organizationId);
  const { data: notificationList, isPending } = useNotifications(organizationId);
  // New notifications (live) open up with a flash.
  const rows = useAnimatedList(notificationList ?? [], (notification) => notification.id, { ready: !isPending });
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
    navigate(issuePath(notification.projectKey, notification.issueNumber));
  }

  const count = unreadCount ?? 0;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Notifications"
        data-tour="bell"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar-active)] text-[var(--color-text-sidebar-active)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        <Bell size={16} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent-600)] px-1 text-xs font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {dropdown.rendered && (
        <div className={`${dropdown.closing ? "motion-fade-out" : "motion-drop-in"} absolute top-11 ${panelAlign === "left" ? "left-0" : "right-0"} z-50 flex max-h-96 w-80 flex-col gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-[var(--color-text-default)] shadow-lg`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            {count > 0 && (
              <Button
                type="button"
                variant="link"
                className="text-xs"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </Button>
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
              {rows.map(({ key, item: notification, state, index }) => (
                <NotificationRow
                  key={key}
                  rowState={state}
                  rowIndex={index}
                  notification={notification}
                  onSelect={() => select(notification)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
