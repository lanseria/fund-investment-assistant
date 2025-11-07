CREATE TABLE "fund_app"."dictionary_data" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dict_type" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fund_app"."dictionary_types" (
	"type" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fund_app"."dictionary_data" ADD CONSTRAINT "dictionary_data_dict_type_dictionary_types_type_fk" FOREIGN KEY ("dict_type") REFERENCES "fund_app"."dictionary_types"("type") ON DELETE cascade ON UPDATE no action;