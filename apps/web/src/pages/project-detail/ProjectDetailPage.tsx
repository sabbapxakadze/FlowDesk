import { Link, useParams } from "react-router";
import { useProjects } from "../../entities/project";
import { IssueCard, useIssues } from "../../entities/issue";
import { CreateIssueForm } from "../../features/create-issue";
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

  if (projectsPending || issuesPending) {
    return <p className="p-8 text-gray-400">Loading…</p>;
  }

  if (!project) {
    return <p className="p-8 text-red-600">Project not found.</p>;
  }

  if (isError) {
    return <p className="p-8 text-red-600">Failed to load issues: {error.message}</p>;
  }

  return (
    <main className="p-8">
      <Link to="/projects" className="text-sm text-blue-600 underline">
        ← All projects
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">{project.name}</h1>

      <CreateIssueForm organizationId={organization!.id} projectId={project.id} />

      {issues.length === 0 ? (
        <p className="text-gray-400">No issues yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} projectKey={project.key} />
          ))}
        </ul>
      )}
    </main>
  );
}
