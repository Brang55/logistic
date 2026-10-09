ALTER TABLE "cargos" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "delay_minutes" integer;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "delay_reason" text;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "delay_reported_at" timestamp with time zone;