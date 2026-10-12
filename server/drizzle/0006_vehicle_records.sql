CREATE TABLE "maintenance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truck_id" uuid,
	"trailer_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"interval_days" integer,
	"interval_km" integer,
	"last_done_on" date,
	"last_done_km" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_items_one_vehicle" CHECK (("maintenance_items"."truck_id" is null) <> ("maintenance_items"."trailer_id" is null))
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truck_id" uuid,
	"trailer_id" uuid,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"file_key" text,
	"file_name" text,
	"file_mime" text,
	"file_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_documents_one_vehicle" CHECK (("vehicle_documents"."truck_id" is null) <> ("vehicle_documents"."trailer_id" is null))
);
--> statement-breakpoint
CREATE TABLE "vehicle_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truck_id" uuid,
	"trailer_id" uuid,
	"entry_date" date NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"odometer_km" integer,
	"cost" double precision,
	"currency" text,
	"notes" text DEFAULT '' NOT NULL,
	"maintenance_item_id" uuid,
	"author_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_log_one_vehicle" CHECK (("vehicle_log"."truck_id" is null) <> ("vehicle_log"."trailer_id" is null))
);
--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "odometer_km" integer;--> statement-breakpoint
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_log" ADD CONSTRAINT "vehicle_log_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_log" ADD CONSTRAINT "vehicle_log_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_log" ADD CONSTRAINT "vehicle_log_maintenance_item_id_maintenance_items_id_fk" FOREIGN KEY ("maintenance_item_id") REFERENCES "public"."maintenance_items"("id") ON DELETE set null ON UPDATE no action;