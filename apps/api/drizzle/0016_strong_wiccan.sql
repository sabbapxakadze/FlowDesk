CREATE TYPE "public"."issue_priority" AS ENUM('none', 'low', 'medium', 'high', 'urgent');--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "priority" "issue_priority" DEFAULT 'none' NOT NULL;