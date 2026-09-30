# widgets

Composed, self-contained UI blocks: `IssueBoard`, `Sidebar`, `ActivityFeed`.
Widgets may import from `features`, `entities` and `shared`, not from `pages`
or `app`.

First widget: `command-palette` (Phase 7 slice 2) — the board
(`ProjectBoardPage`, Phase 5) ended up living directly in `pages/`
instead, since it's a single dedicated route rather than a block reused
across pages. `notification-bell` (Phase 7 slice 3) followed the same
shape: composes `entities/notification` + `entities/issue`; it is now placed
by the navigation shell instead of being globally mounted. `sidebar`
(Phase 3.6 slice 2b) is the navigation itself; it takes an `actions` slot
because a widget may not import another widget (the shell in `app/` puts the
bell there).
