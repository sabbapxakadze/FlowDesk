# 0034 - Issues and Board as two views of one thing (List / Board tabs)

Status: Accepted - 2026-10-06 (step 1 of 2).

## Context

The project's Issues page and Board page show the same issues, yet they were two separate sidebar links, so they read as two different
places. The owner asked for a switch between them and picked underline tabs (look B on the design-system page) and removing the
sidebar's separate Board link.

## Decision

- **Step 1 (this ADR): tabs in both page headers, the pages stay separate.** A `ProjectViewTabs` widget (List / Board) sits at the
  right of the title row of both pages (`PageHeader`'s new `aside` slot). The look is the domain-free `shared/ui/ViewTabs`.
- **They are links, not ARIA tabs.** Each side is its own route and address (`/projects/WEB`, `/projects/WEB/board`), so the control is
  a `nav` with `aria-current="page"` on the current link. `role="tab"` means "switch the panel on this page" and would be wrong.
- **The sidebar has one link, "Issues", for both.** It stays highlighted on the board (`Sidebar` `onBoard`). Sprints, Analytics and
  Settings stay their own links; planning a sprint is a different job from looking at issues.
- **Nothing is carried across.** The list has filters, sorting and paging; the board loads everything and has none, so switching
  starts the other view fresh.

## Step 2 (not built): one page

Merge into one Issues page with the view in the address (`?view=board`), once the board can take the same filters and its endpoint can be limited. The old
`/projects/WEB/board` address would redirect. This needs: filters on `GET .../board`, a decision about paging (a board column is not a page), and moving
the e2e tests that visit `/board`.

## Alternatives rejected

- Keep two sidebar links and add nothing: the same issues stay in two places.
- ARIA `role="tab"` on the links: wrong semantics for navigation between routes.
- Merge the pages now: the board has no filters or paging, so the merge would either drop the list's filters or ship a board that ignores them.
