-- Backfill board_rank for every existing issue, oldest-first within each
-- (project_id, status) column, spaced by 1000 — see ADR 0007. Same
-- (created_at, id) tie-breaker convention already used for keyset
-- pagination (apps/api/src/modules/issues/issues.repository.ts).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, status
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM issues
)
UPDATE issues
SET board_rank = ranked.rn * 1000
FROM ranked
WHERE issues.id = ranked.id;
--> statement-breakpoint
ALTER TABLE issues ALTER COLUMN board_rank SET NOT NULL;
