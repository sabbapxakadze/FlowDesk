import { ProjectCard, useProjects } from "../../entities/project";
import { CreateProjectForm } from "../../features/create-project";
import { useAuth } from "../../shared/auth/useAuth";

/**
 * organizationId now comes from the real, auth-derived session
 * (AuthContext, populated from /auth/login or /auth/refresh) instead of
 * the hardcoded constant Phase 1 left here. This page is wrapped in
 * RequireAuth (see App.tsx), so `organization` is guaranteed non-null by
 * the time this renders — a signed-in user always has exactly one, per
 * Slice 1's auto-create-on-signup design.
 */
export function ProjectsPage() {
  const { organization } = useAuth();
  const { data: projects, isPending, isError, error } = useProjects(organization!.id);

  if (isPending) {
    return <p className="p-8 text-[var(--color-text-muted)]">Loading projects…</p>;
  }

  if (isError) {
    return (
      <p className="p-8 text-[var(--color-text-danger)]">Failed to load projects: {error.message}</p>
    );
  }

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Projects</h1>

      <CreateProjectForm organizationId={organization!.id} />

      {projects.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No projects yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      )}
    </main>
  );
}
