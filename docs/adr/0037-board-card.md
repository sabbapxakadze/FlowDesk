# 0037 - The board card: a priority edge, a footer, quiet labels

Status: Accepted - 2026-10-06.

## Context

The card on the board (and on the sprints page, and in the drag preview) was a key, a title and filled label pills; priority, due date and the
assignee were small and shared the key line, so most of the card was empty. The owner asked for a nicer card and said dragging and moving
are perfect, so only the look may change. From four options and a mix they chose "B, the priority edge".

## Decision

- **A colored edge at the card's left says the priority at a glance**: urgent red, high amber, medium grey, low light grey, none no edge. The colors are existing
  semantic tokens (`text-danger`, `text-warning`, `text-muted`, `border-input`), so both themes follow and no token was added. The edge is decoration
  (`aria-hidden`, `data-priority-edge`): the priority is also written in the footer (icon and word), so color is never the only signal.
- **Layout:** the key and the due date on the first line, the assignee's picture at the top right (still a sibling of the issue link, since a link cannot hold
  another link), the title, and a footer with the labels at the left and the priority at the right. A card with neither labels nor a priority has no footer.
- **Quiet labels:** on cards, labels are small outlined tags (the label's color as a dot, the name in normal text) through `LabelPills variant="outline"`; the Issues list keeps filled, clickable pills.
- **The grip** (the keyboard handle for drag) appears on hover and keyboard focus, and always on touch, like the Edit link on the Issues list. Dragging from anywhere on the card is unchanged.
- **One face for three places:** `IssueCardFrame` and `IssueCardContent` (`entities/issue/ui/IssueCardFace.tsx`) are used by the sortable card, and by the drag preview on the board and on the
  sprints page, which were built by hand before. The dnd-kit wiring in `SortableIssueCard` (listeners, click guard, memoised body, stable render functions) was not touched.
- `IssueSummary` stays for the Issues list, the search results and the search palette.

## Trade-offs, named

- No comment or attachment counts on the card: the data the board loads does not have them (an API change).
- Color alone is not trusted: the priority word stays, so the edge is a quick scan aid, not the information.
- The sprints page cards change with the board's (they share the component).
- The edge colors are theme-aware tokens meant for text; if a theme ever needs its own edge colors, give them their own tokens.

## Alternatives rejected

- A meta footer without the edge (A), a quiet Linear-style card (C), a roomy card with a footer rule (D), and B's edge combined with A's footer (the mix): the owner preferred B as drawn.
