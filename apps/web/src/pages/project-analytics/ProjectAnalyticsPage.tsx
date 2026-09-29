import { Link, useParams } from "react-router";
import { useProjects } from "../../entities/project";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, Skeleton } from "../../shared/ui";
import { CycleTimeChart } from "../../widgets/cycle-time-chart";
import { ThroughputChart } from "../../widgets/throughput-chart";

// Fixed window for this first slice; a URL-driven range selector (same
// ?param convention as the issue list's filters) is a later slice.
const WEEKS = 12;

export function ProjectAnalyticsPage() {
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  if (isPending) {
    return (
      <main className="p-8">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!project) {
    return <p className="p-8 text-[var(--color-text-danger)]">Project not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to={`/projects/${project.id}`} className="text-sm text-[var(--color-text-link)] underline">
        ← {project.name}
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">Analytics</h1>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Throughput</h2>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">Issues completed per week.</p>
        <ThroughputChart organizationId={organization!.id} projectId={project.id} weeks={WEEKS} />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-semibold">Cycle time</h2>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          How long finished issues took, from first in progress to done.
        </p>
        <CycleTimeChart organizationId={organization!.id} projectId={project.id} weeks={WEEKS} />
      </Card>
    </main>
  );
}
