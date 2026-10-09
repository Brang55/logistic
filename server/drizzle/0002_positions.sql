CREATE TABLE "positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"truck_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"point" geometry(point) NOT NULL,
	"speed_kmh" double precision,
	"heading" double precision,
	"source" text DEFAULT 'telematics' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "telematics_id" text;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "positions_truck_recorded_idx" ON "positions" USING btree ("truck_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_telematics_id_unique" UNIQUE("telematics_id");