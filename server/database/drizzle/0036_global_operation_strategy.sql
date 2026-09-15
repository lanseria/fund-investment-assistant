ALTER TABLE "fund_app"."funds" ADD COLUMN "operation_strategy" text;--> statement-breakpoint
UPDATE "fund_app"."funds" f
SET "operation_strategy" = sub.strategy
FROM (
  SELECT DISTINCT ON (fund_code) fund_code, operation_strategy AS strategy
  FROM "fund_app"."holdings"
  WHERE operation_strategy IS NOT NULL
  ORDER BY fund_code, user_id
) sub
WHERE f."code" = sub.fund_code;--> statement-breakpoint
ALTER TABLE "fund_app"."holdings" DROP COLUMN "operation_strategy";
