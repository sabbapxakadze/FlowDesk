# 0035 - "New issue" is a button and a popup, on both Issues and Board

Status: Accepted - 2026-10-06.

## Context

Issues could be created only on the Issues list, through an inline Title / Description / Add issue card above the filters. The Board, now
a tab of the same page (ADR 0034), had no way to create. The owner asked for the two to look consistent and chose, from four mockups, a
"+ New issue" button in the same place on both, opening one popup.

## Decision

- **The inline form is gone.** `features/create-issue` now has `NewIssueButton` (the button, its small C badge, the popup's open state and the
  "C" key) and `CreateIssueDialog` (the shared `Dialog`, the same modal Edit uses). Both pages render only the button.
- **Placement.** First item of the filter row on the list; a row of its own above the columns on the board, with the same top spacing, so the
  button is at the same place after switching tabs (an e2e test measures it).
- **Fields are Title and Description**, exactly what `POST .../issues` accepts. A new issue starts in Todo with no priority.
- **The popup behaves like Edit.** Title is focused; a click on the dimmed area closes it unless text was typed (`isDirty`); Esc, the X and Cancel always
  close it; an empty title shows "Title is required" and creates nothing.
- **C key.** It now opens the popup (it used to focus the inline field) and works on the Board too. The guards are unchanged because they live in
  `useShortcut` (not while typing, not with Ctrl, Cmd or Alt, not while any dialog or the issue panel has focus).
- **Refresh.** A create invalidates `issueKeys.list(projectId)`, which is a prefix of the board and backlog keys, so one call refreshes either page.

## Trade-offs, named

- One extra click compared with the inline form (the C key shortcuts it).
- No choice of column, priority or assignee while creating: the create request does not carry them. Adding `status` and `priority` to the request
  (contracts, service, repository) would let the popup, and a per-column "+" on the board, use them. Not built.
- The button is shown to viewers as the form was; the server's 403 still enforces the permission and shows under the popup.
- The refresh after a create is not what the tests see on their own: with it removed they still pass, because the server's live update refreshes the page.
  It stays for the moment the live connection is down.

## Alternatives rejected

- The same inline form on both pages: most consistent, but about 90px less height on a board that fills the window.
- A one-line title-only bar: loses the description at creation.
- A dashed "add" row inside the list and the Todo column: feels part of the list, but scrolls away and adds only to Todo on the board.
