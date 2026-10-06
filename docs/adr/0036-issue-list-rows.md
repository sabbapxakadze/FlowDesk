# 0036 - The Issues list is one surface of two-line rows

Status: Accepted - 2026-10-06.

## Context

Each issue on the Issues list was a card (own shadow) inside a raised panel (own outline and shadow): a box inside a box, four lines per
issue, and little information per screen. The owner asked for a better look, compared mockups (hairline rows, a table, three ways to combine them)
and chose "a table of two-line rows".

## Decision

- **One bordered surface** holds a header strip (Issue / Status / Priority / Due / Who) and, beneath it, the scrolling rows. There is no card per
  issue and no raised panel. `ScrollPanel`'s `raised` look had no other user and is removed; the list uses its `edges` look (fading edges) on the surface.
- **A row** (`entities/issue/ui/IssueRow.tsx`, replacing the card on this page only): the title (the link) with the label pills on the first
  line and the key under it; then Status, Priority (a muted "-" when none), Due (the "Overdue" marker is kept), Who (photo, profile link, hover card) and Edit.
  Edit is revealed on hover or focus and always visible on a touch screen, as on the comment cards. A hairline separates rows; hover tints the row.
- **The layout follows the LIST's width, not the window's** (a container query on the surface). Wide: the six columns and the header. Narrow: the issue block,
  Who and Edit at its right and status / priority / due on a second line, no header. This also covers the issue side panel: while it is open below 1560px the
  list keeps clear of it (the same right padding the filter row has), so it narrows and stacks instead of sitting under the panel, which it used to do.
- **Unchanged:** board and sprint cards (they are dragged and share `IssueSummary`), and the search results page (still `IssueCard`).
- No API, schema or contracts change.

## Trade-offs, named

- The header is labels only; it could become the sort control later (sorting is a dropdown today).
- The title is the one link, stretched over the whole row (a CSS pseudo-element), so a click on any empty part of a row opens the issue; the label pills, the assignee and Edit sit above it. The key under the title is plain text.
- The hover tint uses the existing `border-default` color at low opacity instead of a new token; revisit if a theme needs its own.
- The search results still use the older card, so the two lists of issues now look different.

## Alternatives rejected

- One surface with hairline rows and no columns (more room per issue but nothing aligned), a plain table (cramped labels, harder on a narrow window),
  cards without the outer panel (smallest change, still a stack of cards) and a Comfortable / Compact switch (a setting to maintain for a problem width already solves).
