CREATE TABLE "fund_app"."ai_execution_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"date" date NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fund_app"."ai_execution_logs" ADD CONSTRAINT "ai_execution_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "fund_app"."users"("id") ON DELETE cascade ON UPDATE no action;