ALTER TABLE "products" ADD COLUMN "mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "variant_image_unique" ON "variants" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "variant_product_position" ON "variants" USING btree ("product_id","position");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_mode_values" CHECK ("products"."mode" in ('standard','photo_variants'));