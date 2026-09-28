# widgets

Composed, self-contained UI blocks: `IssueBoard`, `Sidebar`, `ActivityFeed`.
Widgets may import from `features`, `entities` and `shared`, not from `pages`
or `app`.

First widget: `command-palette` (Phase 7 slice 2) — the board
(`ProjectBoardPage`, Phase 5) ended up living directly in `pages/`
instead, since it's a single dedicated route rather than a block reused
across pages. `notification-bell` (Phase 7 slice 3) followed the same
shape: globally mounted, composes `entities/notification` +
`entities/issue`.
