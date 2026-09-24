import { useState } from "react";
import { Link, useParams } from "react-router";
import { useProjects } from "../../entities/project";
import { IssueCard, useIssues } from "../../entities/issue";
import { CreateIssueForm } from "../../features/create-issue";
import { EditIssueForm } from "../../features/edit-issue";
import { useAuth } from "../../shared/auth/useAuth";

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

  const {
    data: issues,
    isPending: issuesPending,
    isError,
    error,
  } = useIssues(organization!.id, projectId!);

  // Which issue (if any) is currently showing its edit form instead of its
  // card — page-level state because IssueCard (entities layer) can't
  // import EditIssueForm (features layer); this is where the two compose.
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  if (projectsPending || issuesPending) {
    return <p className="p-8 text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (!project) {
    return <p className="p-8 text-[var(--color-text-danger)]">Project not found.</p>;
  }

  if (isError) {
    return (
      <p className="p-8 text-[var(--color-text-danger)]">Failed to load issues: {error.message}</p>
    );
  }

  return (
    <main className="p-8">
      <Link to="/projects" className="text-sm text-[var(--color-text-link)] underline">
        ← All projects
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">{project.name}</h1>

      <CreateIssueForm organizationId={organization!.id} projectId={project.id} />

      {showConflictNotice && (
        <p className="mb-2 text-sm text-[var(--color-text-warning)]">
          That issue was updated by someone else — showing the latest version.
        </p>
      )}

      {issues.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No issues yet.</p>
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
    </main>
  );
}
