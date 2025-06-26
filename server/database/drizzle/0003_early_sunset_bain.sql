CREATE TABLE "fund_app"."funds" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"yesterday_nav" numeric(10, 4) NOT NULL,
	"today_estimate_nav" real,
	"percentage_change" real,
	"today_estimate_update_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fund_app"."holdings" (
	"user_id" bigint NOT NULL,
	"fund_code" varchar(10) NOT NULL,
	"shares" numeric(18, 4) NOT NULL,
	"holding_amount" numeric(12, 2) NOT NULL,
	"holding_profit_amount" numeric(12, 2),
	"holding_profit_rate" real,
	CONSTRAINT "holdings_user_id_fund_code_pk" PRIMARY KEY("user_id","fund_code")
);
--> statement-breakpoint
DROP TABLE "fund_app"."my_holdings" CASCADE;--> statement-breakpoint
ALTER TABLE "fund_app"."holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "fund_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_app"."holdings" ADD CONSTRAINT "holdings_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;