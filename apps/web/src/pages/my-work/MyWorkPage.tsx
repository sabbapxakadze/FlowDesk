import { useSyncExternalStore } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NewIssueAnywhere } from "../../features/create-issue";
import { describeEventFor, useAssignedIssues, useLiveMyWork, useWeekProgress } from "../../entities/issue";
import { useProjects } from "../../entities/project";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from "../../entities/notification";
import { useAuth } from "../../shared/auth/useAuth";
import { addDays, todayKey } from "../../shared/lib/dueDate";
import { issuePath } from "../../shared/lib/paths";
import { useTimezone } from "../../shared/lib/timezone";
import { Button, EmptyState, ErrorText, Page, ScrollPanel, Skeleton } from "../../shared/ui";
import { useIssuePanel } from "../../widgets/issue-detail";
import { greetingFor, hourIn, longDateIn } from "./lib/greeting";
import { bucketIssues, mondayOf, summarize, weekStartFromParam } from "./lib/week";
import { MyWorkHeader } from "./ui/MyWorkHeader";
import { MyWorkIssuePanel } from "./ui/MyWorkIssuePanel";
import { NeedsYouToday } from "./ui/NeedsYouToday";
import { RecentlyUpdated } from "./ui/RecentlyUpdated";
import { WeekAgenda } from "./ui/WeekAgenda";

/** The most open issues the page loads (the API's own maximum); more are counted, and named, but not drawn. */
const ASSIGNED_LOADED = 50;
const UNREAD_SHOWN = 5;

const WIDE_QUERY = "(min-width: 1024px)";

/** True from the width where the page is two columns (Tailwind's `lg`): there the columns scroll inside the window; below it the page just scrolls. */
function useIsWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(WIDE_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

function Heading({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
      {title}
      {count !== undefined && <span className="font-normal text-[var(--color-text-muted)]">{count}</span>}
    </h2>
  );
}

/**
 * "My work", the page `/` opens, as option D2a of the owner's design pass (2026-10-10, ADR 0057): a header with a greeting, one
 * sentence about what is on and the week ring; the week as an agenda (one row per day, the week moved with `?week=`); and on the
 * right what is overdue, the unread notifications and what changed lately. On a wide screen the two columns scroll inside the window, so the page itself does not scroll. The numbers come from two reads: my open issues across
 * projects (`GET .../my-work/issues`) and, for the ring, how many of those due in the shown week are done (`.../my-work/week`).
 * "Today" is the person's own calendar day (ADR 0031, 0032). A click on an issue opens the side panel (ADR 0025). It is live: it joins every project's room and re-reads on any issue change.
 */
export function MyWorkPage() {
  const { organization, user } = useAuth();
  const organizationId = organization!.id;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const timezone = useTimezone();
  const wide = useIsWide();
  const panel = useIssuePanel();

  const now = new Date();
  const today = todayKey(timezone, now);
  const thisMonday = mondayOf(today);
  const weekStart = weekStartFromParam(params.get("week"), today);
  const weekEnd = addDays(weekStart, 6);

  const assigned = useAssignedIssues(organizationId, ASSIGNED_LOADED);
  const progress = useWeekProgress(organizationId, weekStart, weekEnd);
  const notifications = useNotifications(organizationId);
  const projects = useProjects(organizationId);
  // Live: a change to any issue of any project re-reads this page, so an edit (in the panel, on the board, by someone else) shows at once.
  useLiveMyWork(organizationId, projects.data?.map((project) => project.id) ?? []);
  const markRead = useMarkNotificationRead(organizationId);
  const markAllRead = useMarkAllNotificationsRead(organizationId);

  const issues = assigned.data?.data;
  const buckets = issues ? bucketIssues(issues, today, weekStart) : null;
  const summary = issues ? summarize(issues, today) : null;
  const unread = (notifications.data ?? []).filter((n) => n.readAt === null);

  function showWeek(monday: string | null) {
    const next = new URLSearchParams(params);
    if (monday === null || monday === thisMonday) next.delete("week");
    else next.set("week", monday);
    setParams(next);
  }

  function open(notification: Notification) {
    markRead.mutate(notification.id);
    navigate(issuePath(notification.projectKey, notification.issueNumber));
  }

  const firstName = user?.name.split(" ")[0];
  const greeting = `${greetingFor(hourIn(timezone, now))}${firstName ? `, ${firstName}` : ""}`;

  return (
    <Page width="wide">
      <h1 className="sr-only">My work</h1>
      {/* While the floating panel (480px plus its margin) is open the content keeps clear of it below 1560px, as the issue list does. */}
      <div className={panel.issueRef ? "sm:max-[1559px]:pr-[31rem]" : undefined}>
      <MyWorkHeader
        dateLabel={longDateIn(timezone, now)}
        greeting={greeting}
        summary={summary}
        total={assigned.data?.total ?? 0}
        ring={progress.data ?? null}
        ringCaption={weekStart === thisMonday ? "done of those due this week" : "done of those due that week"}
        action={<NewIssueAnywhere organizationId={organizationId} defaultProjectId={issues?.[0]?.projectId} />}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {assigned.isPending ? (
            <div className="flex flex-col gap-2" aria-label="Loading your issues">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : assigned.isError ? (
            <ErrorText>Could not load your issues: {assigned.error.message}</ErrorText>
          ) : assigned.data.total === 0 ? (
            <section aria-label="Assigned to me">
              <EmptyState block>Nothing is assigned to you. Open issues assigned to you will show up here.</EmptyState>
            </section>
          ) : (
            buckets && (
              <>
                <WeekAgenda
                  buckets={buckets}
                  weekStart={weekStart}
                  today={today}
                  thisMonday={thisMonday}
                  fit={wide}
                  onOpen={panel.open}
                  onWeekChange={showWeek}
                />
                {assigned.data.total > assigned.data.data.length && (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                    Showing the {assigned.data.data.length} most recently changed of {assigned.data.total} open issues. In a project&apos;s issues, choose &ldquo;Assigned to me&rdquo; to see them all.
                  </p>
                )}
              </>
            )
          )}
        </div>

        <ScrollPanel label="Overdue and notifications" fitWindow={wide} bottomGap={40}>
        <div className="space-y-5">
          {buckets && <NeedsYouToday overdue={buckets.overdue} onOpen={panel.open} />}

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
                        <span className="font-medium">{notification.event.actorName}</span> {describeEventFor(notification.event, user?.id)}
                        {" — "}
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

          {issues && <RecentlyUpdated issues={issues} onOpen={panel.open} />}
        </div>
        </ScrollPanel>
      </div>
      </div>
      <MyWorkIssuePanel organizationId={organizationId} />
    </Page>
  );
}
