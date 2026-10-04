import { useCallback, useRef } from "react";
import {
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core";

/**
 * Drag and drop between several sortable lists (the board's columns, the sprints page's backlog and
 * active sprint), shared so the hard part exists once. Domain-free on purpose: lists are named by
 * strings and hold item ids, nothing more. Moved out of ProjectBoardPage (ADR 0018's model) when the
 * sprints page needed the same behaviour (ADR 0008, amended).
 *
 * The model: while a card is dragged, the page keeps a local copy of the lists (`ListMap`) and updates
 * it on every dragover, so the card really moves into the list being hovered and its cards slide apart
 * to make room; the drop then sends the final neighbours to the server.
 */
export type ListMap<K extends string> = Record<K, string[]>;

export type OverTarget = { id: UniqueIdentifier; rect: { top: number; height: number } };

/** The helpers for one fixed set of list names. */
export function createMultiList<K extends string>(listIds: readonly K[]) {
  function isListId(id: UniqueIdentifier): id is K {
    return (listIds as readonly string[]).includes(String(id));
  }

  /** The list an id belongs to: the id itself when it IS a list (the empty space), else the list holding that item. */
  function findContainer(lists: ListMap<K>, id: UniqueIdentifier): K | undefined {
    if (isListId(id)) return id;
    return listIds.find((listId) => lists[listId].includes(String(id)));
  }

  /**
   * Moves `activeId` into the list that `over` belongs to, if that is a different list: appended when
   * `over` is the list itself, otherwise next to the hovered card (after it when the dragged card's
   * centre is past that card's middle). Same list: unchanged (the sortable handles reordering).
   */
  function moveAcrossLists(
    lists: ListMap<K>,
    activeId: string,
    over: OverTarget,
    translated: { top: number; height: number } | null,
  ): ListMap<K> {
    const from = findContainer(lists, activeId);
    const to = findContainer(lists, over.id);
    if (!from || !to || from === to) return lists;

    const targetIds = lists[to];
    let index = targetIds.length; // over the list itself: append
    if (!isListId(over.id)) {
      const overIndex = targetIds.indexOf(String(over.id));
      const pastMiddle =
        translated !== null && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;
      index = overIndex + (pastMiddle ? 1 : 0);
    }

    return {
      ...lists,
      [from]: lists[from].filter((id) => id !== activeId),
      [to]: [...targetIds.slice(0, index), activeId, ...targetIds.slice(index)],
    };
  }

  return { isListId, findContainer, moveAcrossLists };
}

/**
 * Collision detection for several lists. Pointer-based, not corner-based: the list under the pointer
 * wins, and inside a list the nearest card does (dnd-kit's multi-container recipe). A keyboard drag has
 * no pointer: the keyboard coordinate getter moves the card's rectangle between droppables, so it is
 * judged by that rectangle's corners, as dnd-kit's sortable keyboard support expects.
 *
 * `insertedNextToRef` is the card the pointer was over when the dragged card was inserted into a
 * different list. Until the pointer moves onto a DIFFERENT card, the dragged card itself is reported as
 * "over": otherwise dnd-kit's swap logic sees the pointer still on that card, decides the dragged card
 * wants to swap into its slot, and moves it back in front of it on drop (the preview said "after", the
 * drop said "before").
 */
export function useMultiListCollision<K extends string>(
  lists: ListMap<K>,
  isListId: (id: UniqueIdentifier) => id is K,
) {
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const insertedNextToRef = useRef<UniqueIdentifier | null>(null);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      if (!args.pointerCoordinates) return closestCorners(args);

      const pointerHits = pointerWithin(args);
      const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, "id");

      if (overId != null) {
        if (isListId(overId)) {
          const ids = lists[overId];
          if (ids.length > 0) {
            const listId = overId;
            overId =
              closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter(
                  (container) => container.id !== listId && ids.includes(String(container.id)),
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
    [lists, isListId],
  );

  const resetGuards = useCallback(() => {
    lastOverId.current = null;
    insertedNextToRef.current = null;
  }, []);

  return { collisionDetection, insertedNextToRef, resetGuards };
}
