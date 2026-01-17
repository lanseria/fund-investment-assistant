CREATE TABLE "fund_app"."news_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text,
	"tag" text,
	"sentiment" text,
	"created_at" timestamp with time zone DEFAULT now()
);
