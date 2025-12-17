CREATE TYPE "fund_app"."transaction_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "fund_app"."transaction_type" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "fund_app"."fund_transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"fund_code" varchar(10) NOT NULL,
	"type" "fund_app"."transaction_type" NOT NULL,
	"status" "fund_app"."transaction_status" DEFAULT 'pending' NOT NULL,
	"order_amount" numeric(18, 2),
	"order_shares" numeric(18, 2),
	"order_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ADD CONSTRAINT "fund_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "fund_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_app"."fund_transactions" ADD CONSTRAINT "fund_transactions_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;