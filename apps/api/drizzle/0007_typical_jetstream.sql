DROP INDEX "issues_project_id_idx";--> statement-breakpoint
CREATE INDEX "issues_project_id_created_at_id_idx" ON "issues" USING btree ("project_id","created_at","id");