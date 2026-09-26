import { Link, useParams } from "react-router";
import type { IssueStatus } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { BoardCard, useBoard } from "../../entities/issue";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, EmptyState, ErrorText, Skeleton, STATUS_LABELS } from "../../shared/ui";

const COLUMNS: IssueStatus[] = ["todo", "in_progress", "done"];

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i}>
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-4 w-32" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Read-only for now — see the Phase 5 slice 1 plan. No dedicated "get
 * one project" fetch, same reasoning as ProjectDetailPage: reuses the
 * cached org-wide project list.
 */
export function ProjectBoardPage() {
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: issues, isPending: issuesPending, isError, error } = useBoard(organization!.id, projectId!);

  if (projectsPending) {
    return <p className="p-8 text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (!project) {
    return <p className="p-8 text-[var(--color-text-danger)]">Project not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to={`/projects/${project.id}`} className="text-sm text-[var(--color-text-link)] underline">
        ← {project.name} (list)
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">{project.name} — Board</h1>

      {isError ? (
        <ErrorText>Failed to load the board: {error.message}</ErrorText>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COLUMNS.map((status) => {
            const columnIssues = issues?.filter((issue) => issue.status === status);
            return (
              <div key={status}>
                <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">
                  {STATUS_LABELS[status]}
                </h2>
                {issuesPending ? (
                  <ColumnSkeleton />
                ) : columnIssues && columnIssues.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {columnIssues.map((issue) => (
                      <BoardCard key={issue.id} issue={issue} projectKey={project.key} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No issues.</EmptyState>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
