CREATE TYPE "fund_app"."dca_frequency" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TABLE "fund_app"."dca_plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"fund_code" varchar(10) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"frequency" "fund_app"."dca_frequency" NOT NULL,
	"anchor_day" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_execution_date" date NOT NULL,
	"last_execution_date" date,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fund_app"."dca_plans" ADD CONSTRAINT "dca_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "fund_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_app"."dca_plans" ADD CONSTRAINT "dca_plans_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;