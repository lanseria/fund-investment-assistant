CREATE SCHEMA "fund_app";
--> statement-breakpoint
CREATE TABLE "fund_app"."my_holdings" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shares" numeric(18, 4) NOT NULL,
	"yesterday_nav" numeric(10, 4) NOT NULL,
	"holding_amount" numeric(12, 2) NOT NULL,
	"today_estimate_nav" real,
	"today_estimate_amount" numeric(12, 2),
	"percentage_change" real,
	"today_estimate_update_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fund_app"."fund_nav_history" (
	"code" varchar(10) NOT NULL,
	"nav_date" date NOT NULL,
	"nav" numeric(10, 4) NOT NULL,
	CONSTRAINT "fund_nav_history_code_nav_date_pk" PRIMARY KEY("code","nav_date")
);
--> statement-breakpoint
CREATE TABLE "fund_app"."strategy_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund_code" varchar(10) NOT NULL,
	"strategy_name" text NOT NULL,
	"signal" text NOT NULL,
	"reason" text NOT NULL,
	"latest_date" date NOT NULL,
	"latest_close" numeric(10, 4) NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
