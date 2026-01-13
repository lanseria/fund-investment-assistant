ALTER TABLE "fund_app"."fund_transactions" ALTER COLUMN "order_amount" SET DATA TYPE numeric(18, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ALTER COLUMN "order_shares" SET DATA TYPE numeric(18, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ALTER COLUMN "confirmed_shares" SET DATA TYPE numeric(18, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ALTER COLUMN "confirmed_amount" SET DATA TYPE numeric(18, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."users" ALTER COLUMN "ai_total_amount" SET DATA TYPE numeric(18, 4);--> statement-breakpoint
ALTER TABLE "fund_app"."users" ALTER COLUMN "ai_total_amount" SET DEFAULT '100000';