ALTER TABLE "trucks" ADD COLUMN "driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "trailer_id" uuid;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Seat each driver in the truck named in their old free-text "usual truck number". Text that matches no
-- truck is dropped; if two drivers named the same truck, the one added first gets it.
UPDATE "trucks" SET "driver_id" = "seated"."id"
FROM (
  SELECT DISTINCT ON (trim("truck_number")) "id", trim("truck_number") AS "truck_number" FROM "drivers"
  WHERE trim("truck_number") <> '' ORDER BY trim("truck_number"), "created_at"
) AS "seated"
WHERE "trucks"."truck_number" = "seated"."truck_number";--> statement-breakpoint
ALTER TABLE "drivers" DROP COLUMN "truck_number";--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_driver_id_unique" UNIQUE("driver_id");--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_trailer_id_unique" UNIQUE("trailer_id");