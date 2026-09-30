# 0018 — Board drag model: whole-card drag, live column preview, pointer-based targets

Status: Accepted — 2026-09-30. Refines the drag decisions in the Phase 5 slice 3
and slice 4 plans (a dedicated grip as the only drag source); ADR 0007 (ranking)
and ADR 0008 (sprints) are unchanged.

## Context

The owner reported that dragging and clicking cards on the Board and the Sprints
page did not feel right and asked for smooth drags between all three columns
(both directions, including skipping a column) and vertically. Causes found in
the code: only a small grip was draggable; nothing moved the card into another
column during the drag, so the target column never made room; each column's drop
target was only its cards list and the board used `closestCorners`, which can
choose the wrong column; a drop always inserted before the hovered card; the
sortable's inline `transition` replaced the card's hover-shadow transition; and
the optimistic update lands asynchronously, so resetting local drag state on drop
risked a flash of the old layout.

## Decision

- **The whole card is the drag source.** dnd-kit's pointer listeners sit on the
  card's `<li>`; the grip button keeps the full listener set (including the
  keyboard ones), which is what makes Space, arrows, Space work. The keyboard
  listener is deliberately not on the card, or Enter on the focused title link
  would start a drag.
- **Click still works.** A press that moves less than 6px never activates the
  drag and navigates normally. After a real drag, the browser's click on release
  could land on the title link and navigate away mid-drop (the original reason
  for the grip-only design), so `useDragClickGuard` cancels that one click and
  the link is `draggable={false}` so the browser's native link drag never starts.
- **Live preview, local state.** While dragging, a copy of the columns is updated
  on every dragover so the card actually moves into the hovered column and the
  cards there make room (in front of the hovered card, or after it when the
  dragged card's centre is past that card's middle). The drop reads the final
  order from that copy and sends the neighbours to the existing move endpoint.
  Escape restores the original layout with no request.
- **Pointer-based targets.** Each column is one droppable covering header, cards
  and the empty space below (the grid stretches columns to the tallest). Collision
  detection is `pointerWithin` (fallback `rectIntersection`); a hit on a column
  is narrowed to its nearest card. A keyboard drag has no pointer, so it uses
  `closestCorners`, which is what dnd-kit's keyboard coordinate getter expects.
- **No flicker on drop.** The preview is kept until the optimistic cache update
  has landed (compared by the board array's identity and the mutation's
  `isPending`), and on failure the rolled-back cache shows again. No `setState`
  in an effect.
- **One held target after crossing.** After the card is inserted into a new
  column, the dragged card itself is reported as the drop target until the pointer
  moves onto a different card. Without this, dnd-kit's swap logic saw the pointer
  still on the card that decided the position and moved the dragged card back in
  front of it on drop (found by measuring: preview "after", drop "before").
- **Hover animation kept.** The sortable transform lives on the `<li>`, the inner
  card keeps `transition-shadow`.
- **Sprints page:** same card behaviour, mouse/touch/keyboard sensors,
  `pointerWithin` with a `closestCenter` fallback, both zones stretch to the row
  height, plus a `DragOverlay`. Membership only (no ordering), as before.
- **The drag overlay must not be rotated or scaled.** dnd-kit measures it; a 1
  degree rotation changed its bounding box by a fraction of a pixel and the
  keyboard coordinate getter then treated cards in the *same* column as being "to
  the right", so ArrowRight moved the card down one place instead of into the next
  column.

## Consequences

- Verified with real mouse and keyboard input in Chrome: every direction
  between the three columns (including Todo to Done), header drops, drops on the
  empty space below the last card, before/after by half of a card, reorder up and
  down in a column, three drags in a row, Escape, a failed move request (card
  snaps back), a plain click, a 3px wiggle, a click right after a drag, Enter on
  the focused title link, keyboard drags in both directions and vertically, hover
  shadow changing, and after every batch the order the server stored matched the
  screen exactly. Sprints page: both directions, drop on empty zone space,
  overlay, highlight, click, Escape.
- Not verified: real touch input (TouchSensor is configured but was not
  exercised), other browsers, and one flaky miss during a scripted run (a
  second drag in a batch did not start; seven later runs, including the same
  script, did not reproduce it).
- Known limit: if another user's change refetches the board mid-drag, the preview
  is based on the layout at drag start until the drop.
- Frame-by-frame smoothness was checked by watching every DOM change after
  the drop (the card never reappears in its old place), not by measuring
  frame rate.

## Alternatives rejected

- **Keep the grip as the only handle and just enlarge it:** does not match
  "drag from anywhere on the card".
- **Apply the move only on drop and draw an insertion line:** simpler, but the
  target column would still not make room while dragging.
- **A different drag library:** dnd-kit already covers pointer, touch and
  keyboard, and the rest of the app uses it.
