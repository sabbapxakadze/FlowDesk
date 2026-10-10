import { ProjectCard, useProjects, useProjectSummaries } from "../../entities/project";
import { useMyRole } from "../../entities/member";
import { NewProjectButton } from "../../features/create-project";
import { ProfileNudgeCard } from "../../features/profile-nudge";
import { useAuth } from "../../shared/auth/useAuth";
import { todayKey } from "../../shared/lib/dueDate";
import { useTimezone } from "../../shared/lib/timezone";
import { Card, EmptyState, ErrorText, Page, PageHeader, Skeleton, useAnimatedList } from "../../shared/ui";

/** As many cards per row as fit, none narrower than 18rem: by the room the page really has, not by the window. */
const GRID = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]";

function ProjectListSkeleton() {
  return (
    <ul className={GRID}>
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} as="li" className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </Card>
      ))}
    </ul>
  );
}

/**
 * The projects of the organization as cards with their numbers (owner's pick A of the design pass, 2026-10-11, ADR 0059): how much is done, what is
 * open, in progress and overdue, the running sprint. The list comes first and the numbers (one read for all projects) fill in a moment later.
 * "New project" opens a popup and is shown only to owners and admins.
 */
export function ProjectsPage() {
  const { organization } = useAuth();
  const organizationId = organization!.id;
  const timezone = useTimezone();
  const today = todayKey(timezone);
  const role = useMyRole(organizationId);
  const canCreate = role === "owner" || role === "admin";
  const { data: projects, isPending, isError, error } = useProjects(organizationId);
  const summaries = useProjectSummaries(organizationId, today);
  const summaryOf = new Map((summaries.data ?? []).map((summary) => [summary.projectId, summary]));
  const rows = useAnimatedList(projects ?? [], (project) => project.id, { ready: !isPending });

  return (
    <Page>
      <PageHeader title="Projects" eyebrow={organization!.name} aside={canCreate ? <NewProjectButton organizationId={organizationId} className="mb-2" /> : undefined} />

      <ProfileNudgeCard />

      {isPending ? (
        <ProjectListSkeleton />
      ) : isError ? (
        <ErrorText>Failed to load projects: {error.message}</ErrorText>
      ) : rows.length === 0 ? (
        <EmptyState block>No projects yet.{canCreate ? " Use New project above." : ""}</EmptyState>
      ) : (
        <ul className={GRID}>
          {rows.map(({ key, item, state, index }) => (
            <ProjectCard key={key} project={item} summary={summaryOf.get(item.id)} today={today} rowState={state} rowIndex={index} />
          ))}
        </ul>
      )}
    </Page>
  );
}
