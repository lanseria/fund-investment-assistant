CREATE TABLE "fund_app"."fund_stock_holdings" (
	"fund_code" varchar(10) NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"stock_name" text NOT NULL,
	"pct" real NOT NULL,
	"report_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_stock_holdings_fund_code_stock_code_pk" PRIMARY KEY("fund_code","stock_code")
);
--> statement-breakpoint
ALTER TABLE "fund_app"."funds" ADD COLUMN "self_estimate_nav" real;--> statement-breakpoint
ALTER TABLE "fund_app"."funds" ADD COLUMN "self_percentage_change" real;--> statement-breakpoint
ALTER TABLE "fund_app"."funds" ADD COLUMN "self_estimate_update_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fund_app"."fund_stock_holdings" ADD CONSTRAINT "fund_stock_holdings_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;