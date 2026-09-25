import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { IssueStatus } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { IssueCard, useIssues } from "../../entities/issue";
import { CreateIssueForm } from "../../features/create-issue";
import { EditIssueForm } from "../../features/edit-issue";
import { useAuth } from "../../shared/auth/useAuth";
import { Button, Card, EmptyState, ErrorText, Select, Skeleton, STATUS_LABELS } from "../../shared/ui";

const STATUS_FILTER_VALUES: IssueStatus[] = ["todo", "in_progress", "done"];

function isIssueStatus(value: string | null): value is IssueStatus {
  return value !== null && (STATUS_FILTER_VALUES as string[]).includes(value);
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
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  // The URL is the source of truth for filter/sort state, not component
  // state — a bookmarked or reloaded ?status=...&order=... URL reproduces
  // the same view. Omitted params mean "all statuses" / newest-first,
  // matching the API's own defaults (see listIssuesQuerySchema).
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const status = isIssueStatus(statusParam) ? statusParam : undefined;
  const order = searchParams.get("order") === "asc" ? "asc" : undefined;

  const {
    data,
    isPending: issuesPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useIssues(organization!.id, projectId!, { status, order });
  // useInfiniteQuery's data is { pages: Page[], pageParams }, not a flat
  // list — flatten once here so the rest of this page (and IssueCard)
  // doesn't need to know pagination happened at all. The ?? [] is only
  // reached before the first page loads, already gated below by
  // issuesPending — never a real empty-vs-loading ambiguity.
  const issues = data?.pages.flatMap((page) => page.data) ?? [];

  // Which issue (if any) is currently showing its edit form instead of its
  // card — page-level state because IssueCard (entities layer) can't
  // import EditIssueForm (features layer); this is where the two compose.
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

  function toggleOrder() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get("order") === "asc") {
        next.delete("order");
      } else {
        next.set("order", "asc");
      }
      return next;
    });
  }

  if (projectsPending) {
    return <p className="p-8 text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (!project) {
    return <p className="p-8 text-[var(--color-text-danger)]">Project not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to="/projects" className="text-sm text-[var(--color-text-link)] underline">
        ← All projects
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">{project.name}</h1>

      <CreateIssueForm organizationId={organization!.id} projectId={project.id} />

      <div className="mt-4 mb-3 flex items-center gap-2">
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
        <Button variant="secondary" size="sm" onClick={toggleOrder}>
          {order === "asc" ? "Oldest first" : "Newest first"}
        </Button>
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
      ) : issues.length === 0 ? (
        <EmptyState>
          {status ? `No ${STATUS_LABELS[status].toLowerCase()} issues.` : "No issues yet."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((issue) =>
            editingIssueId === issue.id ? (
              <EditIssueForm
                key={issue.id}
                issue={issue}
                organizationId={organization!.id}
                projectId={project.id}
                onDone={() => setEditingIssueId(null)}
                onConflict={() => setShowConflictNotice(true)}
              />
            ) : (
              <IssueCard
                key={issue.id}
                issue={issue}
                projectKey={project.key}
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
    </main>
  );
}
