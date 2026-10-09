-- Earlier migrations created SRID-less geometry columns; tag existing points as WGS84.
ALTER TABLE "cargos" ALTER COLUMN "pickup_point" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("pickup_point", 4326);--> statement-breakpoint
ALTER TABLE "cargos" ALTER COLUMN "delivery_point" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("delivery_point", 4326);--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "point" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("point", 4326);
