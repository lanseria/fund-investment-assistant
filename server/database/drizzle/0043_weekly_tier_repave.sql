CREATE TABLE "fund_app"."strategy_tiers_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund_code" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"tiers" jsonb NOT NULL,
	"nav" numeric(10, 4),
	"ma20" numeric(10, 4),
	"ma60" numeric(10, 4),
	"ma250" numeric(10, 4),
	"rsi14" real,
	"bias20" real,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_tiers_history_fund_date_source" UNIQUE("fund_code","date","source")
);
--> statement-breakpoint
ALTER TABLE "fund_app"."strategy_tiers_history" ADD CONSTRAINT "strategy_tiers_history_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;