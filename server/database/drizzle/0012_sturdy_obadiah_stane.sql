ALTER TABLE "fund_app"."fund_transactions" ADD COLUMN "confirmed_nav" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ADD COLUMN "confirmed_shares" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ADD COLUMN "confirmed_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ADD COLUMN "confirmed_at" timestamp with time zone;