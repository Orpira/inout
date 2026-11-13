CREATE TABLE "periodos_liquidados" (
	"id" serial PRIMARY KEY NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"nota" text,
	"resumen" jsonb NOT NULL,
	"detalle" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cerrado_por" integer,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"reabierto_por" integer,
	"reabierto_en" timestamp with time zone,
	"motivo_reapertura" text,
	CONSTRAINT "periodos_liquidados_rango_ck" CHECK ("periodos_liquidados"."hasta" >= "periodos_liquidados"."desde")
);
--> statement-breakpoint
ALTER TABLE "periodos_liquidados" ADD CONSTRAINT "periodos_liquidados_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodos_liquidados" ADD CONSTRAINT "periodos_liquidados_reabierto_por_usuarios_id_fk" FOREIGN KEY ("reabierto_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "periodos_liquidados_rango_idx" ON "periodos_liquidados" USING btree ("desde","hasta");--> statement-breakpoint
-- Dos cierres vigentes (sin reabrir) no pueden compartir ningún día.
ALTER TABLE "periodos_liquidados" ADD CONSTRAINT "periodos_liquidados_sin_solape_ex" EXCLUDE USING gist (daterange("desde", "hasta", '[]') WITH &&) WHERE ("reabierto_en" IS NULL);
