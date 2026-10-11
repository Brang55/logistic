ALTER TABLE "cargos" ADD COLUMN "restrictions_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "restrictions_accepted_by" text;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "restrictions_accepted_truck_id" uuid;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_restrictions_accepted_truck_id_trucks_id_fk" FOREIGN KEY ("restrictions_accepted_truck_id") REFERENCES "public"."trucks"("id") ON DELETE set null ON UPDATE no action;