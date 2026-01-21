CREATE TABLE "fund_app"."ai_daily_analysis" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ai_daily_analysis_date_unique" UNIQUE("date")
);
