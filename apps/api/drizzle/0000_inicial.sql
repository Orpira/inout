CREATE TYPE "public"."categoria_hora" AS ENUM('ORD_DIURNA', 'ORD_NOCTURNA', 'ORD_DIURNA_DF', 'ORD_NOCTURNA_DF', 'EXT_DIURNA', 'EXT_NOCTURNA', 'EXT_DIURNA_DF', 'EXT_NOCTURNA_DF');--> statement-breakpoint
CREATE TYPE "public"."estado_marcacion" AS ENUM('ABIERTA', 'CERRADA', 'REVISION', 'ANULADA');--> statement-breakpoint
CREATE TYPE "public"."origen_marcacion" AS ENUM('KIOSKO', 'KIOSKO_OFFLINE', 'MANUAL', 'MIGRACION');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('ADMIN', 'SUPERVISOR');--> statement-breakpoint
CREATE TYPE "public"."tipo_ajuste_festivo" AS ENUM('AGREGAR', 'QUITAR');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"entidad" text NOT NULL,
	"entidad_id" integer NOT NULL,
	"accion" text NOT NULL,
	"motivo" text,
	"antes" jsonb,
	"despues" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" serial PRIMARY KEY NOT NULL,
	"identificacion" text NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"cargo" text,
	"email" text,
	"telefono" text,
	"salario" numeric(14, 2) DEFAULT 0 NOT NULL,
	"minutos_jornada_dia" integer,
	"fecha_ingreso" date,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empleados_salario_ck" CHECK ("empleados"."salario" >= 0),
	CONSTRAINT "empleados_jornada_ck" CHECK ("empleados"."minutos_jornada_dia" IS NULL OR ("empleados"."minutos_jornada_dia" BETWEEN 60 AND 720))
);
--> statement-breakpoint
CREATE TABLE "festivos_ajustes" (
	"fecha" date PRIMARY KEY NOT NULL,
	"tipo" "tipo_ajuste_festivo" NOT NULL,
	"descripcion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidacion_lineas" (
	"id" serial PRIMARY KEY NOT NULL,
	"marcacion_id" integer NOT NULL,
	"categoria" "categoria_hora" NOT NULL,
	"minutos" integer NOT NULL,
	"factor" numeric(6, 4) NOT NULL,
	"valor_hora" numeric(14, 2) NOT NULL,
	"valor" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"empleado_id" integer NOT NULL,
	"entrada" timestamp with time zone NOT NULL,
	"salida" timestamp with time zone,
	"estado" "estado_marcacion" DEFAULT 'ABIERTA' NOT NULL,
	"origen" "origen_marcacion" DEFAULT 'KIOSKO' NOT NULL,
	"observacion" text,
	"minutos_totales" integer,
	"minutos_extra" integer,
	"valor_recargos" numeric(14, 2),
	"alertas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marcaciones_salida_ck" CHECK ("marcaciones"."salida" IS NULL OR "marcaciones"."salida" >= "marcaciones"."entrada")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" "rol" DEFAULT 'SUPERVISOR' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_lineas" ADD CONSTRAINT "liquidacion_lineas_marcacion_id_marcaciones_id_fk" FOREIGN KEY ("marcacion_id") REFERENCES "public"."marcaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empleados_identificacion_uq" ON "empleados" USING btree ("identificacion");--> statement-breakpoint
CREATE INDEX "liquidacion_lineas_marcacion_idx" ON "liquidacion_lineas" USING btree ("marcacion_id");--> statement-breakpoint
CREATE INDEX "marcaciones_empleado_entrada_idx" ON "marcaciones" USING btree ("empleado_id","entrada");--> statement-breakpoint
CREATE INDEX "marcaciones_entrada_idx" ON "marcaciones" USING btree ("entrada");--> statement-breakpoint
CREATE INDEX "marcaciones_estado_idx" ON "marcaciones" USING btree ("estado");--> statement-breakpoint
CREATE UNIQUE INDEX "marcaciones_una_abierta_uq" ON "marcaciones" USING btree ("empleado_id") WHERE "marcaciones"."estado" = 'ABIERTA';--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree (lower("email"));