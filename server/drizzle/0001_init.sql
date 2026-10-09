CREATE TYPE "public"."user_role" AS ENUM('admin', 'dispatcher', 'driver');--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"shipper_name" text DEFAULT '' NOT NULL,
	"shipper_address" text DEFAULT '' NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"phone_number" text DEFAULT '' NOT NULL,
	"email_address" text DEFAULT '' NOT NULL,
	"receiver_name" text DEFAULT '' NOT NULL,
	"receiver_address" text DEFAULT '' NOT NULL,
	"receiver_contact" text DEFAULT '' NOT NULL,
	"receiver_phone" text DEFAULT '' NOT NULL,
	"receiver_email" text DEFAULT '' NOT NULL,
	"description_of_goods" text DEFAULT '' NOT NULL,
	"quantity" text DEFAULT '' NOT NULL,
	"weight" text DEFAULT '' NOT NULL,
	"dimensions" text DEFAULT '' NOT NULL,
	"pickup_date" text DEFAULT '' NOT NULL,
	"delivery_date" text DEFAULT '' NOT NULL,
	"pickup_location" text DEFAULT '' NOT NULL,
	"delivery_location" text DEFAULT '' NOT NULL,
	"truck_type" text DEFAULT '' NOT NULL,
	"service_type" text DEFAULT '' NOT NULL,
	"temperature_control" text DEFAULT '' NOT NULL,
	"hazardous_material" text DEFAULT '' NOT NULL,
	"special_handling_instructions" text DEFAULT '' NOT NULL,
	"freight_cost" text DEFAULT '' NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"pickup_point" geometry(point),
	"delivery_point" geometry(point),
	"driver_id" uuid,
	"truck_id" uuid,
	"trailer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_number" text DEFAULT '' NOT NULL,
	"truck_driver_email" text NOT NULL,
	"truck_number" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_truck_driver_email_unique" UNIQUE("truck_driver_email")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trailer" text DEFAULT '' NOT NULL,
	"trailer_number" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trailers_trailer_number_unique" UNIQUE("trailer_number")
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truck_number" text NOT NULL,
	"truck_model" text DEFAULT '' NOT NULL,
	"engine_variation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"plate" text,
	"vin" text,
	"height_m" double precision,
	"width_m" double precision,
	"length_m" double precision,
	"weight_t" double precision,
	"axles" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucks_truck_number_unique" UNIQUE("truck_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'dispatcher' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;