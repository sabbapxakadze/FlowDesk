import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Issue, IssueStatus } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { BoardCard, useBoard } from "../../entities/issue";
import { useMoveIssue } from "../../features/move-issue";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, EmptyState, ErrorText, Skeleton, STATUS_LABELS } from "../../shared/ui";

const COLUMNS: IssueStatus[] = ["todo", "in_progress", "done"];

function isColumnId(id: string | number): id is IssueStatus {
  return COLUMNS.includes(id as IssueStatus);
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
 * Droppable on the whole column body (id = the status) — covers empty
 * space and an empty column, meaning "append to this column"; each card
 * inside is its own sortable drop target too, meaning "insert before
 * this card" (see BoardCard). SortableContext only wraps the list
 * itself (not the skeleton/empty states) — it needs real item ids.
 */
function BoardColumn({ status, itemIds, children }: { status: IssueStatus; itemIds: string[]; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className="min-h-16">
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

/**
 * No dedicated "get one project" fetch, same reasoning as
 * ProjectDetailPage: reuses the cached org-wide project list.
 */
export function ProjectBoardPage() {
  const { organization } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: issues, isPending: issuesPending, isError, error } = useBoard(organization!.id, projectId!);
  const moveMutation = useMoveIssue(organization!.id, projectId!);

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  // distance: 8 — a plain click (no real drag) stays under this and
  // still navigates via BoardCard's <Link>; only a real drag activates.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const found = issues?.find((i) => i.id === event.active.id);
    setActiveIssue(found ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over || !issues) return;

    const dragged = issues.find((i) => i.id === active.id);
    if (!dragged) return;

    const targetStatus = isColumnId(over.id) ? over.id : issues.find((i) => i.id === over.id)?.status;
    if (!targetStatus) return;

    // Dropped on a card: insert before it. Dropped on the column body
    // itself (empty space, or below the last card): append.
    const nextIssueId = isColumnId(over.id) ? undefined : String(over.id);
    if (nextIssueId === dragged.id) return; // dropped on itself — no-op

    const targetColumnIssues = issues.filter((i) => i.status === targetStatus && i.id !== dragged.id);
    const nextIndex = nextIssueId ? targetColumnIssues.findIndex((i) => i.id === nextIssueId) : -1;
    const prevIssueId = nextIndex > 0 ? targetColumnIssues[nextIndex - 1]?.id : undefined;

    moveMutation.mutate({
      issueId: dragged.id,
      version: dragged.version,
      status: targetStatus,
      prevIssueId,
      nextIssueId,
    });
  }

  if (projectsPending) {
    return <p className="p-8 text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (!project) {
    return <p className="p-8 text-[var(--color-text-danger)]">Project not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to={`/projects/${project.id}`} className="text-sm text-[var(--color-text-link)] underline">
        ← {project.name} (list)
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">{project.name} — Board</h1>

      {isError ? (
        <ErrorText>Failed to load the board: {error.message}</ErrorText>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {COLUMNS.map((status) => {
              const columnIssues = issues?.filter((issue) => issue.status === status) ?? [];
              return (
                <div key={status}>
                  <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">
                    {STATUS_LABELS[status]}
                  </h2>
                  <BoardColumn status={status} itemIds={columnIssues.map((i) => i.id)}>
                    {issuesPending ? (
                      <ColumnSkeleton />
                    ) : columnIssues.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {columnIssues.map((issue) => (
                          <BoardCard key={issue.id} issue={issue} projectKey={project.key} />
                        ))}
                      </ul>
                    ) : (
                      <EmptyState>No issues.</EmptyState>
                    )}
                  </BoardColumn>
                </div>
              );
            })}
          </div>

          <DragOverlay>
            {activeIssue && (
              <Card className="shadow-md">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {project.key}-{activeIssue.number}
                </p>
                <p className="font-medium">{activeIssue.title}</p>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  );
}
