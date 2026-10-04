-- backlog_rank (ADR 0008, amended): the order of the sprints-page lists. Same two-step shape as
-- board_rank (migrations 0008 and 0009): added nullable, backfilled, then set NOT NULL. A scalar
-- DEFAULT cannot express "appended per list". Today's order (oldest first, id as the tie-break) is
-- kept, within each list: the backlog (sprint_id IS NULL) and each sprint.
ALTER TABLE "issues" ADD COLUMN "backlog_rank" numeric;--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, sprint_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM issues
)
UPDATE issues
SET backlog_rank = ranked.rn * 1000
FROM ranked
WHERE issues.id = ranked.id;--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "backlog_rank" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "issues_project_id_sprint_id_backlog_rank_id_idx" ON "issues" USING btree ("project_id","sprint_id","backlog_rank","id");
