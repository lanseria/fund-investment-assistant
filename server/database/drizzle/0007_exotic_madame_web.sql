ALTER TABLE "fund_app"."holdings" ALTER COLUMN "shares" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_app"."holdings" ALTER COLUMN "cost_price" DROP NOT NULL;