ALTER TABLE "fund_app"."holdings" ADD COLUMN "cost_price" numeric(10, 4) NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_app"."holdings" DROP COLUMN "holding_profit_rate";