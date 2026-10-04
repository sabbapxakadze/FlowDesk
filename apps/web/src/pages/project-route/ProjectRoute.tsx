import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useProjects } from "../../entities/project";
import { useAuth } from "../../shared/auth/useAuth";
import { isUuid, projectPath } from "../../shared/lib/paths";
import { ErrorText, Page, PageHeader, Skeleton } from "../../shared/ui";

/**
 * The layout route of every project page (`/projects/:projectKey/...`, ADR 0030). It turns the key in the
 * address into the project ONCE, from the project list the app already caches (no request of its own), and
 * shows its child pages only when a project was found. The pages then work on `project.id` exactly as they
 * did when the address carried the id, and need no loading or "not found" branch of their own.
 *
 * - Old addresses carried the project's id; those still work, and so does a lowercase key. Either is
 *   rewritten once to the canonical form (`/projects/WEB/...`), keeping the rest of the path, the query
 *   string and the router state, and replacing the history entry so Back does not bounce through it.
 * - An unknown key is "Project not found" here, once, instead of six times.
 */
export function ProjectRoute() {
  const { projectKey = "" } = useParams();
  const { organization } = useAuth();
  const { data: projects, isPending, isError, error } = useProjects(organization!.id);
  const location = useLocation();
  const navigate = useNavigate();

  const project = projects?.find((candidate) =>
    isUuid(projectKey) ? candidate.id === projectKey : candidate.key.toLowerCase() === projectKey.toLowerCase(),
  );
  const canonical = project !== undefined && projectKey === project.key;

  useEffect(() => {
    if (!project || canonical) return;
    const rest = location.pathname.replace(/^\/projects\/[^/]+/, "");
    navigate(
      { pathname: `${projectPath(project.key)}${rest}`, search: location.search, hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [project, canonical, location, navigate]);

  if (isPending || (project && !canonical)) {
    return (
      <Page>
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </Page>
    );
  }

  if (isError) {
    return (
      <Page>
        <ErrorText>Failed to load projects: {error.message}</ErrorText>
      </Page>
    );
  }

  if (!project) {
    return (
      <Page>
        <PageHeader title="Project not found" back={{ to: "/projects", label: "Projects" }} />
        <p className="text-sm text-[var(--color-text-muted)]">
          There is no project “{projectKey}” in your organization, or it was deleted.
        </p>
      </Page>
    );
  }

  return <Outlet context={project} />;
}
