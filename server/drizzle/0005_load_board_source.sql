ALTER TABLE "cargos" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "cargos" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "cargos_source_external_idx" ON "cargos" USING btree ("source","external_id");