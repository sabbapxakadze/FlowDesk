import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Issue, IssueStatus } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { useMemberNames } from "../../entities/member";
import { BoardCard, IssueSummary, useBoard, useLiveIssueUpdates } from "../../entities/issue";
import { useMoveIssue } from "../../features/move-issue";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Card,
  cn,
  ColumnHeader,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
} from "../../shared/ui";

const COLUMNS: IssueStatus[] = ["todo", "in_progress", "done"];

/** Issue ids per column, in display order. */
type ColumnMap = Record<IssueStatus, string[]>;

function isColumnId(id: UniqueIdentifier): id is IssueStatus {
  return COLUMNS.includes(id as IssueStatus);
}

function buildColumns(issues: Issue[] | undefined): ColumnMap {
  const map: ColumnMap = { todo: [], in_progress: [], done: [] };
  for (const issue of issues ?? []) map[issue.status].push(issue.id);
  return map;
}

function findContainer(map: ColumnMap, id: UniqueIdentifier): IssueStatus | undefined {
  if (isColumnId(id)) return id;
  return COLUMNS.find((status) => map[status].includes(String(id)));
}

/**
 * The drag in progress, or just finished and waiting for the server's optimistic
 * update to land. `columns` is the live preview (the dragged card already moved
 * into the column being hovered, so the cards there slide apart to make room).
 */
type DragState = {
  columns: ColumnMap;
  dragging: boolean;
  /** The board array at the moment of the drop, to tell when the cache changed. */
  issuesAtDrop: Issue[] | undefined;
};

/**
 * Moves `activeId` into the column that `over` belongs to, if that is a
 * different column: appended when `over` is the column itself, otherwise next
 * to the hovered card (after it when the dragged card's centre is past that
 * card's middle). Same column: unchanged (the sortable handles reordering).
 */
function moveAcrossColumns(
  columns: ColumnMap,
  activeId: string,
  over: { id: UniqueIdentifier; rect: { top: number; height: number } },
  translated: { top: number; height: number } | null,
): ColumnMap {
  const from = findContainer(columns, activeId);
  const to = findContainer(columns, over.id);
  if (!from || !to || from === to) return columns;

  const targetIds = columns[to];
  let index = targetIds.length; // over the column itself: append
  if (!isColumnId(over.id)) {
    const overIndex = targetIds.indexOf(String(over.id));
    const pastMiddle =
      translated !== null && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;
    index = overIndex + (pastMiddle ? 1 : 0);
  }

  return {
    ...columns,
    [from]: columns[from].filter((id) => id !== activeId),
    [to]: [...targetIds.slice(0, index), activeId, ...targetIds.slice(index)],
  };
}

function ColumnSkeleton() {
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
 * One droppable for the whole column: header, cards and the empty space below,
 * so a card can be dropped anywhere in the column, not only on the cards list.
 * The grid stretches every column to the tallest one. `highlighted` marks the
 * column that currently holds the dragged card. Each card inside is its own
 * sortable target ("insert here"); the page's collision detection maps the
 * column itself to its nearest card.
 */
function BoardColumn({
  status,
  itemIds,
  highlighted,
  header,
  children,
}: {
  status: IssueStatus;
  itemIds: string[];
  highlighted: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-48 flex-col rounded-[var(--radius-card)] p-2 transition-colors",
        highlighted && "bg-[var(--color-border-default)]/60",
      )}
    >
      {header}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

/**
 * No dedicated "get one project" fetch, same reasoning as
 * ProjectDetailPage: reuses the cached org-wide project list.
 *
 * Drag model (ADR 0018): the whole card is the drag source; while dragging, a
 * local copy of the columns (`drag.columns`) is updated on every dragover so the
 * card really moves into the hovered column and the cards there make room; the
 * drop then sends the final neighbours to the existing move endpoint.
 */
export function ProjectBoardPage() {
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const panel = useIssuePanel();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const nameOf = useMemberNames(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: issues, isPending: issuesPending, isError, error } = useBoard(organization!.id, projectId!);
  const moveMutation = useMoveIssue(organization!.id, projectId!);
  useLiveIssueUpdates(projectId!);

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  // The card the pointer was over when the dragged card was inserted into a new
  // column. Until the pointer moves onto a DIFFERENT card, the dragged card
  // itself is reported as "over": otherwise dnd-kit's swap logic sees the
  // pointer still on that card, decides the dragged card wants to swap into its
  // slot, and moves it back in front of it on drop (the preview said "after",
  // the drop said "before").
  const insertedNextToRef = useRef<UniqueIdentifier | null>(null);

  const baseColumns = useMemo(() => buildColumns(issues), [issues]);
  const byId = useMemo(() => new Map((issues ?? []).map((issue) => [issue.id, issue])), [issues]);

  // Keep showing the preview while dragging, and after the drop until the
  // optimistic cache update has landed (the board array changes), so the old
  // layout never flashes between the drop and that update. On error the cache
  // is rolled back, the mutation stops being pending, and the real layout shows.
  const showPreview =
    drag !== null && (drag.dragging || (moveMutation.isPending && issues === drag.issuesAtDrop));
  const columns = showPreview ? drag.columns : baseColumns;

  // A grabbing cursor for the whole page while a card is being dragged.
  useEffect(() => {
    if (!activeIssue) return;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeIssue]);

  // distance 6: a plain click stays under it and navigates via the card's
  // <Link>; touch needs a short press so scrolling the page still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Pointer-based, not corner-based: the column under the pointer wins, and
  // inside a column the nearest card does (dnd-kit's multi-container recipe).
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      // A keyboard drag has no pointer: the keyboard coordinate getter moves the
      // card's rectangle between droppables, so it is judged by that rectangle's
      // corners, exactly as dnd-kit's sortable keyboard support expects.
      if (!args.pointerCoordinates) return closestCorners(args);

      const pointerHits = pointerWithin(args);
      const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, "id");

      if (overId != null) {
        if (isColumnId(overId)) {
          const ids = columns[overId];
          if (ids.length > 0) {
            const columnId = overId;
            overId =
              closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter(
                  (container) => container.id !== columnId && ids.includes(String(container.id)),
                ),
              })[0]?.id ?? overId;
          }
        }
        if (insertedNextToRef.current != null) {
          if (overId === insertedNextToRef.current) return [{ id: args.active.id }];
          insertedNextToRef.current = null;
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
    },
    [columns],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveIssue(byId.get(String(event.active.id)) ?? null);
    setDrag({ columns: baseColumns, dragging: true, issuesAtDrop: undefined });
    lastOverId.current = null;
    insertedNextToRef.current = null;
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);

    if (drag && findContainer(drag.columns, activeId) !== findContainer(drag.columns, over.id)) {
      insertedNextToRef.current = isColumnId(over.id) ? null : over.id;
    }
    setDrag((previous) =>
      previous
        ? { ...previous, columns: moveAcrossColumns(previous.columns, activeId, over, active.rect.current.translated) }
        : previous,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    lastOverId.current = null;
    insertedNextToRef.current = null;

    const activeId = String(active.id);
    const dragged = byId.get(activeId);
    if (!drag || !dragged || !over) {
      setDrag(null); // dropped outside every column: nothing changes
      return;
    }

    let finalColumns = drag.columns;
    const target = findContainer(finalColumns, activeId);
    if (!target) {
      setDrag(null);
      return;
    }

    // Same-column reorder: dnd-kit's sortable decides the final index.
    if (!isColumnId(over.id) && findContainer(finalColumns, over.id) === target) {
      const ids = finalColumns[target];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        finalColumns = { ...finalColumns, [target]: arrayMove(ids, from, to) };
      }
    }

    const ids = finalColumns[target];
    const index = ids.indexOf(activeId);
    const prevIssueId = ids[index - 1];
    const nextIssueId = ids[index + 1];

    const original = baseColumns[dragged.status];
    const originalIndex = original.indexOf(activeId);
    const unchanged =
      target === dragged.status &&
      original[originalIndex - 1] === prevIssueId &&
      original[originalIndex + 1] === nextIssueId;
    if (unchanged) {
      setDrag(null);
      return;
    }

    setDrag({ columns: finalColumns, dragging: false, issuesAtDrop: issues });
    moveMutation.mutate({
      issueId: dragged.id,
      version: dragged.version,
      status: target,
      prevIssueId,
      nextIssueId,
    });
  }

  function handleDragCancel() {
    setActiveIssue(null);
    setDrag(null);
    lastOverId.current = null;
    insertedNextToRef.current = null;
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

  const activeContainer = activeIssue ? findContainer(columns, activeIssue.id) : undefined;

  return (
    <Page width="wide">
      <PageHeader eyebrow={project.name} title="Board" />

      {isError ? (
        <ErrorText>Failed to load the board: {error.message}</ErrorText>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
            {COLUMNS.map((status) => {
              const ids = columns[status];
              const columnIssues = ids.flatMap((id) => {
                const issue = byId.get(id);
                return issue ? [issue] : [];
              });
              return (
                <BoardColumn
                  key={status}
                  status={status}
                  itemIds={ids}
                  highlighted={activeContainer === status}
                  header={<ColumnHeader status={status} count={issuesPending ? undefined : ids.length} />}
                >
                  {issuesPending ? (
                    <ColumnSkeleton />
                  ) : columnIssues.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {columnIssues.map((issue) => (
                        <BoardCard
                          key={issue.id}
                          issue={issue}
                          projectKey={project.key}
                          assigneeName={nameOf(issue.assigneeId)}
                          onOpen={panel.open}
                        />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState block>No issues</EmptyState>
                  )}
                </BoardColumn>
              );
            })}
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
