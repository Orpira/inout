CREATE TYPE "public"."estado_marca_offline" AS ENUM('APLICADA', 'RECHAZADA', 'RESUELTA');--> statement-breakpoint
CREATE TABLE "marcas_offline" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"capturado_en" timestamp with time zone NOT NULL,
	"capturado_dispositivo" timestamp with time zone NOT NULL,
	"desfase_segundos" integer DEFAULT 0 NOT NULL,
	"dispositivo" text,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" "estado_marca_offline" NOT NULL,
	"tipo" text,
	"mensaje" text,
	"empleado_id" integer,
	"marcacion_id" integer,
	"resuelta_por" integer,
	"resuelta_en" timestamp with time zone,
	"nota_resolucion" text
);
--> statement-breakpoint
ALTER TABLE "empleados" DROP CONSTRAINT "empleados_jornada_ck";--> statement-breakpoint
ALTER TABLE "marcas_offline" ADD CONSTRAINT "marcas_offline_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcas_offline" ADD CONSTRAINT "marcas_offline_marcacion_id_marcaciones_id_fk" FOREIGN KEY ("marcacion_id") REFERENCES "public"."marcaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcas_offline" ADD CONSTRAINT "marcas_offline_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marcas_offline_estado_idx" ON "marcas_offline" USING btree ("estado","capturado_en");--> statement-breakpoint
ALTER TABLE "empleados" DROP COLUMN "minutos_jornada_dia";