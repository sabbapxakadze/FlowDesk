ALTER TYPE "public"."auth_token_purpose" ADD VALUE 'email_change';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(64);--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "new_email" varchar(255);