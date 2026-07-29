CREATE TABLE "fund_app"."sector_bindings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dict_value" text NOT NULL,
	"sector_code" text NOT NULL,
	"sector_type" text NOT NULL,
	"sector_name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_binding_dict_value" UNIQUE("dict_value")
);
--> statement-breakpoint
CREATE TABLE "fund_app"."sector_capital_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"sector_code" text NOT NULL,
	"dict_value" text,
	"sector_name" text,
	"change_percent" numeric(10, 4),
	"amount" numeric(18, 4),
	"main_capital" numeric(18, 4),
	"retail_capital" numeric(18, 4),
	"main_hidden" numeric(18, 4),
	"main_strength" numeric(10, 4),
	"main_action" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_date_sector_code" UNIQUE("date","sector_code")
);
--> statement-breakpoint
-- 删除废弃的死表 sector_daily_stats (字段与主力行为数据不匹配，从未被使用，已由 sector_capital_daily 取代)
DROP TABLE IF EXISTS "fund_app"."sector_daily_stats";
