import { ProjectCard, useProjects } from "../../entities/project";

/**
 * TEMPORARY: there's no auth yet, so there's no real "current organization"
 * to read this from. This is the id `pnpm db:seed` creates locally — it's
 * a random UUID, regenerated per database, so this constant only works
 * against your own local flowdesk_dev. Phase 2 replaces this entirely with
 * real org context (from a session), not a smarter constant.
 */
const SEEDED_DEMO_ORG_ID = "09c3b461-3c3e-40fd-9a52-10b858b045b2";

export function ProjectsPage() {
  const { data: projects, isPending, isError, error } = useProjects(SEEDED_DEMO_ORG_ID);

  if (isPending) {
    return <p className="p-8 text-gray-400">Loading projects…</p>;
  }

  if (isError) {
    return <p className="p-8 text-red-600">Failed to load projects: {error.message}</p>;
  }

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Projects</h1>
      {projects.length === 0 ? (
        <p className="text-gray-400">No projects yet.</p>
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
