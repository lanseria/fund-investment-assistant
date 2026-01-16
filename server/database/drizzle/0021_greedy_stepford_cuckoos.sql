ALTER TABLE "fund_app"."users" ADD COLUMN "available_cash" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_app"."users" DROP COLUMN "total_assets";