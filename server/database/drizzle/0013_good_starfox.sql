CREATE TABLE "fund_app"."daily_news" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "daily_news_date_unique" UNIQUE("date")
);
