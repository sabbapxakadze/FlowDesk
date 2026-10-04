import { useState } from "react";
import { useSearchParams } from "react-router";
import type { IssuePriority, IssueStatus } from "@flowdesk/contracts";
import { useCurrentProject } from "../../entities/project";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { useMembers, useMemberNames } from "../../entities/member";
import { IssueCard, useIssues, useLiveIssueUpdates } from "../../entities/issue";
import { CreateIssueForm } from "../../features/create-issue";
import { EditIssueForm } from "../../features/edit-issue";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  Select,
  Skeleton,
  STATUS_LABELS,
  useAnimatedList,
} from "../../shared/ui";

const STATUS_FILTER_VALUES: IssueStatus[] = ["todo", "in_progress", "done"];

function isIssueStatus(value: string | null): value is IssueStatus {
  return value !== null && (STATUS_FILTER_VALUES as string[]).includes(value);
}

function isIssuePriority(value: string | null): value is IssuePriority {
  return value !== null && (PRIORITY_ORDER as string[]).includes(value);
}

function IssueListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} as="li">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="mb-2 h-4 w-48" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </ul>
  );
}

/**
 * No dedicated "get one project" fetch — this reuses the same
 * useProjects(organizationId) query the projects list page already
 * populates (TanStack Query serves it from cache) and finds the project
 * client-side. Keeps this slice scoped to issues; see the Phase 3 slice 1
 * plan's "Decisions" section.
 */
export function ProjectDetailPage() {
  const { organization, user } = useAuth();
  // The project comes from the address (ProjectRoute resolves the key once; never null here).
  const project = useCurrentProject();
  const projectId = project.id;

  // The URL is the source of truth for filter/sort state, not component
  // state — a bookmarked or reloaded ?status=...&order=... URL reproduces
  // the same view. Omitted params mean "all statuses" / newest-first,
  // matching the API's own defaults (see listIssuesQuerySchema).
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const status = isIssueStatus(statusParam) ? statusParam : undefined;
  const priorityParam = searchParams.get("priority");
  const priority = isIssuePriority(priorityParam) ? priorityParam : undefined;
  // A user id or "unassigned". Not validated against the member list: an id that
  // matches nobody simply returns an empty list, and the API rejects a non-uuid.
  const assigneeParam = searchParams.get("assignee");
  const assignee = assigneeParam && assigneeParam !== "" ? assigneeParam : undefined;
  const sort = searchParams.get("sort") === "priority" ? "priority" : undefined;
  const order = searchParams.get("order") === "asc" ? "asc" : undefined;
  // The three choices the dropdown offers: newest first (the default, nothing in the URL),
  // oldest first (?order=asc) and highest priority first (?sort=priority).
  const sortChoice = sort === "priority" ? "priority" : order === "asc" ? "oldest" : "newest";

  const {
    data,
    isPending: issuesPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useIssues(organization!.id, projectId, { status, priority, assignee, sort, order });
  const { data: members } = useMembers(organization!.id);
  const nameOf = useMemberNames(organization!.id);
  useLiveIssueUpdates(projectId);
  // useInfiniteQuery's data is { pages: Page[], pageParams }, not a flat
  // list — flatten once here so the rest of this page (and IssueCard)
  // doesn't need to know pagination happened at all. The ?? [] is only
  // reached before the first page loads, already gated below by
  // issuesPending — never a real empty-vs-loading ambiguity.
  const issues = data?.pages.flatMap((page) => page.data) ?? [];
  // Rows that appear or leave (created, deleted, changed by someone else) move; a new filter, sort or page of
  // results is not a change (it is part of the reset key), so those rows just rise in.
  const issueRows = useAnimatedList(issues, (issue) => issue.id, {
    ready: !issuesPending,
    resetKey: `${status}|${priority}|${assignee}|${sort}|${order}|${data?.pages.length ?? 0}`,
  });

  // Which issue (if any) is currently showing its edit form instead of its
  // card — page-level state because IssueCard (entities layer) can't
  // import EditIssueForm (features layer); this is where the two compose.
  const panel = useIssuePanel();
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  function setStatusFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("status");
      } else {
        next.set("status", value);
      }
      return next;
    });
  }

  function setPriorityFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("priority");
      } else {
        next.set("priority", value);
      }
      return next;
    });
  }

  function setAssigneeFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("assignee");
      } else {
        next.set("assignee", value);
      }
      return next;
    });
  }

  function setSortChoice(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("sort");
      next.delete("order");
      if (value === "oldest") next.set("order", "asc");
      if (value === "priority") next.set("sort", "priority");
      return next;
    });
  }

  return (
    <Page>
      <PageHeader eyebrow={project.name} title="Issues" />

      <CreateIssueForm organizationId={organization!.id} projectId={project.id} />

      {/* data-panel-trigger: working the filters while an issue is open in the side panel must not
          close it (the panel ignores clicks here), and the list changes behind it. */}
      {/* While the floating panel is open (480px wide, plus its margin) the row keeps clear of it, so
          a filter that would sit underneath wraps onto a second line instead of being unreachable. Only below
          1560px: on a wider window nothing is covered, so nothing may move. */}
      <div
        data-panel-trigger
        className={`mt-4 mb-3 flex flex-wrap items-center gap-2 ${panel.issueRef ? "sm:max-[1559px]:pr-[31rem]" : ""}`}
      >
        <Select
          value={status ?? ""}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_FILTER_VALUES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          value={priority ?? ""}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-auto"
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select
          value={assignee ?? ""}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="w-auto"
          aria-label="Filter by assignee"
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {/* "Assigned to me" is just the signed-in user's own id. */}
          {user && <option value={user.id}>Assigned to me</option>}
          {members
            ?.filter((member) => member.userId !== user?.id)
            .map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
        </Select>
        <Select
          value={sortChoice}
          onChange={(e) => setSortChoice(e.target.value)}
          className="w-auto"
          aria-label="Sort"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Highest priority first</option>
        </Select>
      </div>

      {showConflictNotice && (
        <p className="mb-2 text-sm text-[var(--color-text-warning)]">
          That issue was updated by someone else — showing the latest version.
        </p>
      )}

      {issuesPending ? (
        <IssueListSkeleton />
      ) : isError ? (
        <ErrorText>Failed to load issues: {error.message}</ErrorText>
      ) : issueRows.length === 0 ? (
        <EmptyState block>
          {status || priority || assignee
            ? "No issues match these filters."
            : "No issues yet."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {issueRows.map(({ key, item: issue, state, index }) =>
            editingIssueId === issue.id ? (
              <EditIssueForm
                key={key}
                issue={issue}
                organizationId={organization!.id}
                projectId={project.id}
                onDone={() => setEditingIssueId(null)}
                onConflict={() => setShowConflictNotice(true)}
              />
            ) : (
              <IssueCard
                key={key}
                rowState={state}
                rowIndex={index}
                issue={issue}
                projectKey={project.key}
                assigneeName={nameOf(issue.assigneeId)}
                onOpen={panel.open}
                onEdit={() => {
                  setShowConflictNotice(false);
                  setEditingIssueId(issue.id);
                }}
              />
            ),
          )}
        </ul>
      )}

      {hasNextPage && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
      <IssuePanel project={project} />
    </Page>
  );
}
