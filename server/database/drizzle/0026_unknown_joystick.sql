ALTER TABLE "fund_app"."users" ADD COLUMN "api_token" text;--> statement-breakpoint
ALTER TABLE "fund_app"."users" ADD CONSTRAINT "users_api_token_unique" UNIQUE("api_token");