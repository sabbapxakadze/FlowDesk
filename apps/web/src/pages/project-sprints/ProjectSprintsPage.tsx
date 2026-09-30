import { type ReactNode } from "react";
import { useParams } from "react-router";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useProjects } from "../../entities/project";
import { SprintIssueCard, useBacklog } from "../../entities/issue";
import { SprintStatusBadge, useSprints } from "../../entities/sprint";
import { CreateSprintForm } from "../../features/create-sprint";
import { useStartSprint, useCompleteSprint } from "../../features/manage-sprint";
import { useAssignIssueSprint } from "../../features/assign-issue-sprint";
import { useAuth } from "../../shared/auth/useAuth";
import { Button, Card, ColumnHeader, EmptyState, ErrorText, Page, PageHeader, Skeleton } from "../../shared/ui";

function ListSkeleton() {
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

/** Droppable on the whole zone — "backlog" or "active-sprint", meaning
 * "move the dragged issue here." No sortable insert-before semantics,
 * unlike BoardColumn — see the Phase 5 slice 4 plan's "Decisions". */
function DropZone({ id, children }: { id: "backlog" | "active-sprint"; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-24 rounded-[var(--radius-card)] p-1 transition-colors ${
        isOver ? "bg-[var(--color-border-default)]" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * No dedicated "get one project" fetch, same reasoning as
 * ProjectBoardPage/ProjectDetailPage: reuses the cached org-wide project
 * list.
 */
export function ProjectSprintsPage() {
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: sprints, isPending: sprintsPending } = useSprints(organization!.id, projectId!);
  const { data: backlogData, isPending: backlogPending, isError, error } = useBacklog(organization!.id, projectId!);
  const startMutation = useStartSprint(organization!.id, projectId!);
  const completeMutation = useCompleteSprint(organization!.id, projectId!);
  const assignMutation = useAssignIssueSprint(organization!.id, projectId!);

  const backlog = backlogData?.backlog ?? [];
  const activeSprint = backlogData?.activeSprint ?? null;
  const activeSprintIssues = backlogData?.activeSprintIssues ?? [];

  // No sortable coordinate getter needed (see DropZone) — the default
  // KeyboardSensor step is enough to move focus between two large zones.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const issueId = String(active.id);
    const dragged = [...backlog, ...activeSprintIssues].find((i) => i.id === issueId);
    if (!dragged) return;

    if (over.id === "active-sprint") {
      if (!activeSprint || dragged.sprintId === activeSprint.id) return;
      assignMutation.mutate({ issueId, version: dragged.version, sprintId: activeSprint.id });
    } else if (over.id === "backlog") {
      if (dragged.sprintId === null) return;
      assignMutation.mutate({ issueId, version: dragged.version, sprintId: null });
    }
  }

  if (projectsPending) {
    return (
      <Page>
        <p className="text-[var(--color-text-muted)]">Loading…</p>
      </Page>
    );
  }

  if (!project) {
    return (
      <Page>
        <p className="text-[var(--color-text-danger)]">Project not found.</p>
      </Page>
    );
  }

  return (
    <Page width="wide">
      <PageHeader eyebrow={project.name} title="Sprints" />

      <CreateSprintForm organizationId={organization!.id} projectId={project.id} />

      <section className="mb-6">
        <ColumnHeader label="Sprints" count={sprintsPending ? undefined : sprints?.length} />
        {sprintsPending ? (
          <ListSkeleton />
        ) : !sprints || sprints.length === 0 ? (
          <EmptyState block>No sprints yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {sprints.map((sprint) => (
              <Card key={sprint.id} as="li" className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{sprint.name}</p>
                  <SprintStatusBadge status={sprint.status} />
                </div>
                {sprint.status === "planned" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={startMutation.isPending}
                    onClick={() => startMutation.mutate({ sprintId: sprint.id, version: sprint.version })}
                  >
                    Start
                  </Button>
                )}
                {sprint.status === "active" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={completeMutation.isPending}
                    onClick={() => completeMutation.mutate({ sprintId: sprint.id, version: sprint.version })}
                  >
                    Complete
                  </Button>
                )}
              </Card>
            ))}
          </ul>
        )}
        {startMutation.isError && <ErrorText>{startMutation.error.message}</ErrorText>}
        {completeMutation.isError && <ErrorText>{completeMutation.error.message}</ErrorText>}
      </section>

      {isError ? (
        <ErrorText>Failed to load the backlog: {error.message}</ErrorText>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <ColumnHeader label="Backlog" count={backlogPending ? undefined : backlog.length} />
              <DropZone id="backlog">
                {backlogPending ? (
                  <ListSkeleton />
                ) : backlog.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {backlog.map((issue) => (
                      <SprintIssueCard key={issue.id} issue={issue} projectKey={project.key} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState block>Backlog is empty.</EmptyState>
                )}
              </DropZone>
            </div>
            <div>
              <ColumnHeader
                status={activeSprint ? "in_progress" : undefined}
                label={activeSprint ? `Active: ${activeSprint.name}` : "No active sprint"}
                count={backlogPending || !activeSprint ? undefined : activeSprintIssues.length}
              />
              <DropZone id="active-sprint">
                {backlogPending ? (
                  <ListSkeleton />
                ) : !activeSprint ? (
                  <EmptyState block>Start a planned sprint to drag issues here.</EmptyState>
                ) : activeSprintIssues.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {activeSprintIssues.map((issue) => (
                      <SprintIssueCard key={issue.id} issue={issue} projectKey={project.key} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState block>No issues in this sprint yet.</EmptyState>
                )}
              </DropZone>
            </div>
          </div>
        </DndContext>
      )}
    </Page>
  );
}
