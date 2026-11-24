CREATE TABLE "product_aliases" (
	"source_slug" text NOT NULL,
	"variant_id" text NOT NULL,
	CONSTRAINT "product_aliases_source_slug_variant_id_pk" PRIMARY KEY("source_slug","variant_id")
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;