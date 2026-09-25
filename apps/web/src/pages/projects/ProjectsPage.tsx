import { ProjectCard, useProjects } from "../../entities/project";
import { CreateProjectForm } from "../../features/create-project";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, EmptyState, ErrorText, Skeleton } from "../../shared/ui";

function ProjectListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} as="li">
          <Skeleton className="mb-2 h-4 w-40" />
          <Skeleton className="h-3 w-16" />
        </Card>
      ))}
    </ul>
  );
}

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

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Projects</h1>

      <CreateProjectForm organizationId={organization!.id} />

      {isPending ? (
        <ProjectListSkeleton />
      ) : isError ? (
        <ErrorText>Failed to load projects: {error.message}</ErrorText>
      ) : projects.length === 0 ? (
        <EmptyState>No projects yet.</EmptyState>
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
