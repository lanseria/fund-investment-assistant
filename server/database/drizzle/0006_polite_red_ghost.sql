CREATE TYPE "public"."fund_type" AS ENUM('open', 'qdii_lof');--> statement-breakpoint
ALTER TABLE "fund_app"."funds" ADD COLUMN "fund_type" "fund_type" DEFAULT 'open' NOT NULL;