CREATE TABLE "fund_app"."market_holidays" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_year_holiday_name" UNIQUE("year","name")
);
