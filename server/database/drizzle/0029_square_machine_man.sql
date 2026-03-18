CREATE TYPE "fund_app"."ai_mode" AS ENUM('auto', 'draft', 'off');--> statement-breakpoint
ALTER TYPE "fund_app"."transaction_status" ADD VALUE 'draft' BEFORE 'pending';--> statement-breakpoint
ALTER TABLE "fund_app"."users" ADD COLUMN "ai_mode" "fund_app"."ai_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_app"."users" DROP COLUMN "is_ai_agent";