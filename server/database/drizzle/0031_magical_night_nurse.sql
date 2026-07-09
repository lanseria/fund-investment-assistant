CREATE TABLE "fund_app"."fund_fees" (
	"fund_code" varchar(10) PRIMARY KEY NOT NULL,
	"purchase_fee" text,
	"redemption_fees" jsonb,
	"management_fee" text,
	"custody_fee" text,
	"raw_text" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fund_app"."fund_fees" ADD CONSTRAINT "fund_fees_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "fund_app"."funds"("code") ON DELETE cascade ON UPDATE no action;