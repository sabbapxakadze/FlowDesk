import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { GetBacklogResponse, Issue } from "@flowdesk/contracts";
import { useCurrentProject } from "../../entities/project";
import { AssigneeAvatar } from "../../entities/member";
import { IssueSummary, SortableIssueCard, useBacklog } from "../../entities/issue";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { SprintStatusBadge, useSprints } from "../../entities/sprint";
import { CreateSprintForm } from "../../features/create-sprint";
import { useStartSprint, useCompleteSprint } from "../../features/manage-sprint";
import { DeleteSprintButton } from "../../features/delete-sprint";
import { RenameSprintForm } from "../../features/rename-sprint";
import { useAssignIssueSprint } from "../../features/assign-issue-sprint";
import { useAuth } from "../../shared/auth/useAuth";
import { createMultiList, useMultiListCollision, type ListMap } from "../../shared/dnd/multiList";
import { Button, Card, ColumnHeader, EmptyState, ErrorText, Lane, Page, PageHeader, Skeleton, useAnimatedList } from "../../shared/ui";

/**
 * The two lists a card can be dragged between and within: the backlog and the active sprint. The drag
 * model (lists, hovering, collision) is shared with the board: shared/dnd/multiList (ADR 0008, amended).
 */
const LISTS = ["backlog", "active-sprint"] as const;
type ListId = (typeof LISTS)[number];
type IssueLists = ListMap<ListId>;
const { isListId, findContainer, moveAcrossLists } = createMultiList(LISTS);

function buildLists(data: GetBacklogResponse | undefined): IssueLists {
  return {
    backlog: (data?.backlog ?? []).map((issue) => issue.id),
    "active-sprint": (data?.activeSprintIssues ?? []).map((issue) => issue.id),
  };
}

/** The drag in progress, or just finished and waiting for the optimistic update to land (same as the board). */
type DragState = { lists: IssueLists; dragging: boolean; dataAtDrop: GetBacklogResponse | undefined };

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

/**
 * One list (backlog or active sprint): droppable on the whole lane, so a card can be dropped anywhere in it,
 * and a sortable context over its cards, so a card is dropped at an exact place (before or after a neighbour).
 */
function SprintList({
  id,
  itemIds,
  highlighted,
  dragging,
  header,
  children,
}: {
  id: ListId;
  itemIds: string[];
  highlighted: boolean;
  /** A card is being dragged: the lane keeps at least the height it had when the drag began. */
  dragging: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <Lane
      ref={setNodeRef}
      label={id === "backlog" ? "Backlog" : "Active sprint"}
      highlighted={highlighted}
      freezeHeight={dragging}
      header={header}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </Lane>
  );
}

/**
 * No dedicated "get one project" fetch, same reasoning as
 * ProjectBoardPage/ProjectDetailPage: reuses the cached org-wide project
 * list.
 */
export function ProjectSprintsPage() {
  const { organization } = useAuth();
  const panel = useIssuePanel();
  const project = useCurrentProject();
  const projectId = project.id;

  const { data: sprints, isPending: sprintsPending } = useSprints(organization!.id, projectId);
  const sprintRows = useAnimatedList(sprints ?? [], (sprint) => sprint.id, { ready: !sprintsPending });
  const [renamingSprintId, setRenamingSprintId] = useState<string | null>(null);
  const { data: backlogData, isPending: backlogPending, isError, error } = useBacklog(organization!.id, projectId);
  const startMutation = useStartSprint(organization!.id, projectId);
  const completeMutation = useCompleteSprint(organization!.id, projectId);
  const assignMutation = useAssignIssueSprint(organization!.id, projectId);

  const activeSprint = backlogData?.activeSprint ?? null;
  const byId = useMemo(
    () => new Map([...(backlogData?.backlog ?? []), ...(backlogData?.activeSprintIssues ?? [])].map((i) => [i.id, i])),
    [backlogData],
  );
  const baseLists = useMemo(() => buildLists(backlogData), [backlogData]);

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Keep the preview while dragging and, after the drop, until the optimistic cache update has landed.
  const showPreview =
    drag !== null && (drag.dragging || (assignMutation.isPending && backlogData === drag.dataAtDrop));
  const lists = showPreview ? drag.lists : baseLists;

  // A grabbing cursor for the whole page while a card is being dragged.
  useEffect(() => {
    if (!activeIssue) return;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeIssue]);

  // distance 6 keeps a plain click a click; touch needs a short press so the page still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { collisionDetection, insertedNextToRef, resetGuards } = useMultiListCollision(lists, isListId);

  function handleDragStart(event: DragStartEvent) {
    setActiveIssue(byId.get(String(event.active.id)) ?? null);
    setDrag({ lists: baseLists, dragging: true, dataAtDrop: undefined });
    resetGuards();
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    // There is no sprint to drop into until one is active.
    if (over.id === "active-sprint" && !activeSprint) return;

    if (drag && findContainer(drag.lists, activeId) !== findContainer(drag.lists, over.id)) {
      insertedNextToRef.current = isListId(over.id) ? null : over.id;
    }
    setDrag((previous) =>
      previous
        ? { ...previous, lists: moveAcrossLists(previous.lists, activeId, over, active.rect.current.translated) }
        : previous,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    resetGuards();

    const activeId = String(active.id);
    const dragged = byId.get(activeId);
    if (!drag || !dragged || !over) {
      setDrag(null); // dropped outside both lists: nothing changes
      return;
    }

    let finalLists = drag.lists;
    const target = findContainer(finalLists, activeId);
    if (!target || (target === "active-sprint" && !activeSprint)) {
      setDrag(null);
      return;
    }

    // Same-list reorder: dnd-kit's sortable decides the final index.
    if (!isListId(over.id) && findContainer(finalLists, over.id) === target) {
      const ids = finalLists[target];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        finalLists = { ...finalLists, [target]: arrayMove(ids, from, to) };
      }
    }

    const ids = finalLists[target];
    const index = ids.indexOf(activeId);
    const prevIssueId = ids[index - 1];
    const nextIssueId = ids[index + 1];

    const originalTarget: ListId = dragged.sprintId === null ? "backlog" : "active-sprint";
    const original = baseLists[originalTarget];
    const originalIndex = original.indexOf(activeId);
    const unchanged =
      target === originalTarget &&
      original[originalIndex - 1] === prevIssueId &&
      original[originalIndex + 1] === nextIssueId;
    if (unchanged) {
      setDrag(null);
      return;
    }

    setDrag({ lists: finalLists, dragging: false, dataAtDrop: backlogData });
    assignMutation.mutate({
      issueId: dragged.id,
      version: dragged.version,
      sprintId: target === "backlog" ? null : activeSprint!.id,
      prevIssueId,
      nextIssueId,
    });
  }

  function handleDragCancel() {
    setActiveIssue(null);
    setDrag(null);
    resetGuards();
  }

  return (
    <Page width="wide">
      {/* From sm up the page fills the window: the Sprints list is capped and scrolls inside, and the two
          lists take the height that is left (at least 24rem; a shorter window scrolls the page). The 4rem is
          the Page's own vertical padding. On a phone everything stacks at its natural height. */}
      <div className="flex flex-col sm:h-[calc(100dvh-4rem)] sm:min-h-[44rem]">
      <PageHeader eyebrow={project.name} title="Sprints" />

      <CreateSprintForm organizationId={organization!.id} projectId={project.id} />

      <section className="mb-4 shrink-0">
        <ColumnHeader label="Sprints" count={sprintsPending ? undefined : sprints?.length} />
        {sprintsPending ? (
          <ListSkeleton />
        ) : !sprints || sprintRows.length === 0 ? (
          <EmptyState block>No sprints yet.</EmptyState>
        ) : (
          <ul className="scrollbar-list-always flex flex-col gap-2 sm:max-h-[19rem] sm:overflow-y-auto sm:pr-1">
            {sprintRows.map(({ key, item: sprint, state, index }) => (
              <Card key={key} as="li" rowState={state} rowIndex={index} className="flex items-center justify-between gap-2">
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
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid grid-cols-1 gap-4 sm:min-h-0 sm:flex-1 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]">
            {LISTS.map((listId) => {
              const ids = lists[listId];
              const listIssues = ids.flatMap((id) => {
                const issue = byId.get(id);
                return issue ? [issue] : [];
              });
              const isSprint = listId === "active-sprint";
              const activeContainer = activeIssue ? findContainer(lists, activeIssue.id) : undefined;
              return (
                <SprintList
                  key={listId}
                  id={listId}
                  itemIds={ids}
                  highlighted={activeContainer === listId}
                  dragging={activeIssue !== null}
                  header={
                    isSprint ? (
                      <ColumnHeader
                        status={activeSprint ? "in_progress" : undefined}
                        label={activeSprint ? `Active: ${activeSprint.name}` : "No active sprint"}
                        count={backlogPending || !activeSprint ? undefined : ids.length}
                      />
                    ) : (
                      <ColumnHeader label="Backlog" count={backlogPending ? undefined : ids.length} />
                    )
                  }
                >
                  {backlogPending ? (
                    <ListSkeleton />
                  ) : isSprint && !activeSprint ? (
                    <EmptyState block>Start a planned sprint to drag issues here.</EmptyState>
                  ) : listIssues.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {listIssues.map((issue) => (
                        <SortableIssueCard
                          key={issue.id}
                          issue={issue}
                          projectKey={project.key}
                          assignee={issue.assigneeId ? <AssigneeAvatar organizationId={organization!.id} userId={issue.assigneeId} /> : null}
                          onOpen={panel.open}
                          dragLabel="Drag to reorder or move between backlog and sprint"
                        />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState block>{isSprint ? "No issues in this sprint yet." : "Backlog is empty."}</EmptyState>
                  )}
                </SprintList>
              );
            })}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {activeIssue && (
              <Card className="flex cursor-grabbing shadow-lg">
                <IssueSummary
                  issue={activeIssue}
                  projectKey={project.key}
                  assignee={
                    activeIssue.assigneeId ? (
                      <AssigneeAvatar organizationId={organization!.id} userId={activeIssue.assigneeId} interactive={false} />
                    ) : null
                  }
                />
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
      </div>
      <IssuePanel project={project} />
    </Page>
  );
}
