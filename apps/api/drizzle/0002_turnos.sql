CREATE TABLE "programacion" (
	"empleado_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"turno_id" integer,
	"hora_inicio" text,
	"hora_fin" text,
	"descanso_inicio" text,
	"descanso_fin" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programacion_empleado_id_fecha_pk" PRIMARY KEY("empleado_id","fecha")
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"descanso_inicio" text,
	"descanso_fin" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnos_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "empleados" ADD COLUMN "dia_descanso" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programacion" ADD CONSTRAINT "programacion_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programacion" ADD CONSTRAINT "programacion_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "programacion_fecha" ON "programacion" USING btree ("fecha");