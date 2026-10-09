ALTER TABLE "users" ADD COLUMN "tour_seen_at" timestamp with time zone;--> statement-breakpoint
-- Hand-added backfill: everyone who already has an account counts as having seen the tour, so only people who sign up after this
-- migration get it started on their first visit.
UPDATE "users" SET "tour_seen_at" = now();
