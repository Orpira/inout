CREATE TABLE "horarios" (
	"empleado_id" integer NOT NULL,
	"vigente_desde" date NOT NULL,
	"semana" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "horarios_empleado_id_vigente_desde_pk" PRIMARY KEY("empleado_id","vigente_desde")
);
--> statement-breakpoint
DROP TABLE "programacion" CASCADE;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;