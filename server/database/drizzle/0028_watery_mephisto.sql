CREATE TABLE "fund_app"."sector_daily_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"sector" text NOT NULL,
	"change_rate" numeric(10, 4),
	"turnover_rate" numeric(10, 4),
	"volume_ratio" numeric(10, 4),
	"total_market_cap" numeric(20, 4),
	"net_inflow" numeric(18, 4),
	"up_count" integer,
	"down_count" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_date_sector" UNIQUE("date","sector")
);
