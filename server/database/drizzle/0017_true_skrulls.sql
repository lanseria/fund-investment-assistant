ALTER TABLE "fund_app"."users" ADD COLUMN "ai_model" text DEFAULT 'xiaomi/mimo-v2-flash:free';--> statement-breakpoint
ALTER TABLE "fund_app"."users" ADD COLUMN "ai_total_amount" numeric(18, 2) DEFAULT '100000';--> statement-breakpoint
ALTER TABLE "fund_app"."users" ADD COLUMN "ai_system_prompt" text;