CREATE TYPE "public"."estado_extras" AS ENUM('SIN_EXTRAS', 'TOLERANCIA', 'PENDIENTE', 'APROBADAS', 'RECHAZADAS', 'AUTOMATICAS');--> statement-breakpoint
CREATE TYPE "public"."tipo_horario" AS ENUM('FIJO', 'TURNOS');--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_horario" NOT NULL,
	"dias" jsonb NOT NULL,
	"descanso" jsonb,
	"tolerancia_minutos" integer DEFAULT 0 NOT NULL,
	"requiere_aprobacion" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empleados" ADD COLUMN "horario_id" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "minutos_extra_calculados" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "minutos_descanso" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "estado_extras" "estado_extras";--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "minutos_extra_aprobados" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "extras_revisadas_por" integer;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD COLUMN "extras_revisadas_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_extras_revisadas_por_usuarios_id_fk" FOREIGN KEY ("extras_revisadas_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marcaciones_estado_extras_idx" ON "marcaciones" USING btree ("estado_extras");