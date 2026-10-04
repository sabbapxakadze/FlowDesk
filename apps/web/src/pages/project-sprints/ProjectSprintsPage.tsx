import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Issue } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { useMemberNames } from "../../entities/member";
import { IssueSummary, SprintIssueCard, useBacklog } from "../../entities/issue";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { SprintStatusBadge, useSprints } from "../../entities/sprint";
import { CreateSprintForm } from "../../features/create-sprint";
import { useStartSprint, useCompleteSprint } from "../../features/manage-sprint";
import { DeleteSprintButton } from "../../features/delete-sprint";
import { RenameSprintForm } from "../../features/rename-sprint";
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
 * unlike BoardColumn — see the Phase 5 slice 4 plan's "Decisions". The zone
 * stretches to the height of the row (flex-1 inside a stretching column) with
 * a generous minimum, so there is always a large target to drop on. */
function DropZone({ id, children }: { id: "backlog" | "active-sprint"; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-64 flex-1 rounded-[var(--radius-card)] p-1 transition-colors ${
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
  const panel = useIssuePanel();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const nameOf = useMemberNames(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: sprints, isPending: sprintsPending } = useSprints(organization!.id, projectId!);
  const [renamingSprintId, setRenamingSprintId] = useState<string | null>(null);
  const { data: backlogData, isPending: backlogPending, isError, error } = useBacklog(organization!.id, projectId!);
  const startMutation = useStartSprint(organization!.id, projectId!);
  const completeMutation = useCompleteSprint(organization!.id, projectId!);
  const assignMutation = useAssignIssueSprint(organization!.id, projectId!);

  const backlog = backlogData?.backlog ?? [];
  const activeSprint = backlogData?.activeSprint ?? null;
  const activeSprintIssues = backlogData?.activeSprintIssues ?? [];

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  // A grabbing cursor for the whole page while a card is being dragged.
  useEffect(() => {
    if (!activeIssue) return;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeIssue]);

  // No sortable coordinate getter needed (see DropZone) — the default
  // KeyboardSensor step is enough to move focus between two large zones.
  // distance 6 keeps a plain click a click; touch needs a short press so the
  // page still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // The zone under the pointer wins; if the pointer is outside both (or a
  // keyboard drag has no pointer), fall back to the nearest zone.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveIssue([...backlog, ...activeSprintIssues].find((i) => i.id === id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveIssue(null);
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
                {renamingSprintId === sprint.id ? (
                  <RenameSprintForm
                    organizationId={organization!.id}
                    projectId={project.id}
                    sprint={sprint}
                    onDone={() => setRenamingSprintId(null)}
                  />
                ) : (
                  <div className="min-w-0">
                    <p className="font-medium">{sprint.name}</p>
                    <SprintStatusBadge status={sprint.status} />
                  </div>
                )}
                {renamingSprintId !== sprint.id && (
                  // Three fixed slots in a fixed order (Rename, Start or Complete, Delete), so Rename
                  // sits at the same place on every row whatever the status: a slot a status does not
                  // use stays empty instead of letting the other buttons slide into it.
                  <div className="flex shrink-0 items-center gap-2" data-testid="sprint-actions">
                    <div className="w-20">
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        aria-label={`Rename ${sprint.name}`}
                        onClick={() => setRenamingSprintId(sprint.id)}
                      >
                        Rename
                      </Button>
                    </div>
                    <div className="w-24">
                      {sprint.status === "planned" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
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
                          fullWidth
                          disabled={completeMutation.isPending}
                          onClick={() => completeMutation.mutate({ sprintId: sprint.id, version: sprint.version })}
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                    <div className="flex min-w-20 justify-end">
                      {sprint.status !== "active" && (
                        <DeleteSprintButton organizationId={organization!.id} projectId={project.id} sprint={sprint} />
                      )}
                    </div>
                  </div>
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
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveIssue(null)}
        >
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
            <div className="flex flex-col">
              <ColumnHeader label="Backlog" count={backlogPending ? undefined : backlog.length} />
              <DropZone id="backlog">
                {backlogPending ? (
                  <ListSkeleton />
                ) : backlog.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {backlog.map((issue) => (
                      <SprintIssueCard
                        key={issue.id}
                        issue={issue}
                        projectKey={project.key}
                        assigneeName={nameOf(issue.assigneeId)}
                        onOpen={panel.open}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState block>Backlog is empty.</EmptyState>
                )}
              </DropZone>
            </div>
            <div className="flex flex-col">
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
                      <SprintIssueCard
                        key={issue.id}
                        issue={issue}
                        projectKey={project.key}
                        assigneeName={nameOf(issue.assigneeId)}
                        onOpen={panel.open}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState block>No issues in this sprint yet.</EmptyState>
                )}
              </DropZone>
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {activeIssue && (
              <Card className="flex cursor-grabbing shadow-lg">
                <IssueSummary
                  issue={activeIssue}
                  projectKey={project.key}
                  assigneeName={nameOf(activeIssue.assigneeId)}
                />
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <IssuePanel projectId={project.id} />
    </Page>
  );
}
