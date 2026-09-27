CREATE TYPE "public"."sprint_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "sprint_status" DEFAULT 'planned' NOT NULL,
	"start_date" date,
	"end_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "sprint_id" uuid;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprints_organization_id_idx" ON "sprints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sprints_project_id_idx" ON "sprints" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_project_id_active_unique" ON "sprints" USING btree ("project_id") WHERE "sprints"."status" = 'active';--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_project_id_sprint_id_idx" ON "issues" USING btree ("project_id","sprint_id");