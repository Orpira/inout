CREATE TABLE "empresa" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"nombre" text NOT NULL,
	"nit" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_unica" CHECK ("empresa"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"ciudad" text,
	"direccion" text,
	"latitud" double precision,
	"longitud" double precision,
	"radio_metros" integer DEFAULT 300 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sucursales_coordenadas" CHECK (("sucursales"."latitud" is null) = ("sucursales"."longitud" is null))
);
--> statement-breakpoint
ALTER TABLE "empleados" ADD COLUMN "sucursal_id" integer;--> statement-breakpoint
ALTER TABLE "horarios" ADD COLUMN "sucursal_id" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "sucursal_id" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "horario_id" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "latitud" double precision;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "longitud" double precision;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "precision_metros" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "distancia_sede_metros" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "sucursales_codigo_uq" ON "sucursales" USING btree (lower("codigo"));--> statement-breakpoint
CREATE UNIQUE INDEX "sucursales_nombre_uq" ON "sucursales" USING btree (lower("nombre"));--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marcaciones_sucursal_idx" ON "marcaciones" USING btree ("sucursal_id");