ALTER TABLE "cargos" ADD CONSTRAINT "cargos_status_check" CHECK ("cargos"."status" in ('new', 'edited', 'confirmed', 'picked_up', 'delivered', 'cancelled'));--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_status_check" CHECK ("drivers"."status" in ('available', 'taken'));--> statement-breakpoint
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_status_check" CHECK ("trailers"."status" in ('available', 'taken'));--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_status_check" CHECK ("trucks"."status" in ('available', 'taken'));