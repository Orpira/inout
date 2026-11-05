CREATE TYPE "public"."estado_marcacion" AS ENUM('ABIERTA', 'CERRADA', 'REVISION', 'ANULADA');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('ADMIN', 'SUPERVISOR');--> statement-breakpoint
CREATE TYPE "public"."tipo_ajuste_festivo" AS ENUM('AGREGAR', 'QUITAR');--> statement-breakpoint
CREATE TABLE "ajustes_festivos" (
	"fecha" date PRIMARY KEY NOT NULL,
	"tipo" "tipo_ajuste_festivo" NOT NULL,
	"nombre" text
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" integer NOT NULL,
	"usuario_id" integer,
	"motivo" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" serial PRIMARY KEY NOT NULL,
	"documento" text NOT NULL,
	"nombre" text NOT NULL,
	"salario_mensual" integer NOT NULL,
	"jornada_pactada_min" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empleados_documento_unique" UNIQUE("documento")
);
--> statement-breakpoint
CREATE TABLE "marcaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"empleado_id" integer NOT NULL,
	"entrada" timestamp with time zone NOT NULL,
	"salida" timestamp with time zone,
	"estado" "estado_marcacion" DEFAULT 'ABIERTA' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"hash_clave" text NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marcaciones_una_abierta" ON "marcaciones" USING btree ("empleado_id") WHERE "marcaciones"."estado" = 'ABIERTA';--> statement-breakpoint
CREATE INDEX "marcaciones_empleado_entrada" ON "marcaciones" USING btree ("empleado_id","entrada");