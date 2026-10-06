CREATE TYPE "public"."oauth_provider" AS ENUM('google', 'github');--> statement-breakpoint
CREATE TABLE "oauth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identities_provider_user_unique" ON "oauth_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identities_user_provider_unique" ON "oauth_identities" USING btree ("user_id","provider");