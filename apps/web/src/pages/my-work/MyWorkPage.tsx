import { Link, useNavigate } from "react-router";
import { describeEvent, useAssignedIssues } from "../../entities/issue";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from "../../entities/notification";
import { useAuth } from "../../shared/auth/useAuth";
import { issuePath, projectPath } from "../../shared/lib/paths";
import { Button, Card, EmptyState, DueDate, ErrorText, Page, PageHeader, PriorityBadge, Skeleton, StatusBadge } from "../../shared/ui";

const ASSIGNED_SHOWN = 10;
const UNREAD_SHOWN = 5;

function Heading({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
      {title}
      {count !== undefined && <span className="font-normal text-[var(--color-text-muted)]">{count}</span>}
    </h2>
  );
}

/**
 * "My work", the page `/` opens (owner's pick C of three layouts, 2026-10-05): what is assigned to me across all the
 * projects, and what I have not read yet. Nothing here is new data: the assigned list is one query across projects
 * (`GET .../my-work/issues`), the notifications are the bell's own list, so reading one here clears it in the bell.
 */
export function MyWorkPage() {
  const { organization, user } = useAuth();
  const organizationId = organization!.id;
  const navigate = useNavigate();
  const assigned = useAssignedIssues(organizationId, ASSIGNED_SHOWN);
  const notifications = useNotifications(organizationId);
  const markRead = useMarkNotificationRead(organizationId);
  const markAllRead = useMarkAllNotificationsRead(organizationId);

  const unread = (notifications.data ?? []).filter((n) => n.readAt === null);

  function open(notification: Notification) {
    markRead.mutate(notification.id);
    navigate(issuePath(notification.projectKey, notification.issueNumber));
  }

  return (
    <Page>
      <PageHeader title="My work" eyebrow={user ? `Hello, ${user.name}` : undefined} />

      <section aria-label="Assigned to me" className="mb-8">
        <Heading title="Assigned to me" count={assigned.data?.total} />
        {assigned.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : assigned.isError ? (
          <ErrorText>Could not load your issues: {assigned.error.message}</ErrorText>
        ) : assigned.data.data.length === 0 ? (
          <EmptyState block>Nothing is assigned to you. Open issues assigned to you will show up here.</EmptyState>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {assigned.data.data.map((issue) => (
                <li key={issue.id}>
                  <Card hoverable className="flex items-center justify-between gap-3">
                    <Link to={issuePath(issue.projectKey, issue.number)} className="block min-w-0 flex-1">
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {issue.projectKey}-{issue.number} &middot; {issue.projectName}
                      </p>
                      <p className="truncate font-medium">{issue.title}</p>
                    </Link>
                    <PriorityBadge priority={issue.priority} />
                    <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
                    <StatusBadge status={issue.status} />
                  </Card>
                </li>
              ))}
            </ul>
            {assigned.data.total > assigned.data.data.length && (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                and {assigned.data.total - assigned.data.data.length} more. In a project&apos;s issues, choose &ldquo;Assigned to me&rdquo; to see them all, for example{" "}
                <Link to={`${projectPath(assigned.data.data[0]!.projectKey)}?assignee=${user?.id ?? ""}`} className="underline">
                  {assigned.data.data[0]!.projectName}
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>

      <section aria-label="Unread notifications">
        <div className="mb-2 flex items-center justify-between">
          <Heading title="Unread notifications" count={notifications.isSuccess ? unread.length : undefined} />
          {unread.length > 0 && (
            <Button type="button" variant="link" className="text-xs" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          )}
        </div>
        {notifications.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : notifications.isError ? (
          <ErrorText>Could not load notifications: {notifications.error.message}</ErrorText>
        ) : unread.length === 0 ? (
          <EmptyState block>You are all caught up.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1">
            {unread.slice(0, UNREAD_SHOWN).map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className="flex w-full items-start gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-surface)]"
                >
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent-600)]" />
                  <span className="min-w-0">
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {notification.projectKey}-{notification.issueNumber}
                    </span>
                    <span className="font-medium">{notification.event.actorName}</span> {describeEvent(notification.event)}
                    {" \u2014 "}
                    {notification.issueTitle}
                  </span>
                </button>
              </li>
            ))}
            {unread.length > UNREAD_SHOWN && (
              <li className="px-3 py-1 text-sm text-[var(--color-text-muted)]">and {unread.length - UNREAD_SHOWN} more in the bell.</li>
            )}
          </ul>
        )}
      </section>
    </Page>
  );
}
