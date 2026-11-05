import { CATEGORIAS } from "@inout/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const rolEnum = pgEnum("rol", ["ADMIN", "SUPERVISOR"]);
export const estadoMarcacionEnum = pgEnum("estado_marcacion", [
  "ABIERTA",
  "CERRADA",
  "REVISION",
  "ANULADA",
]);
export const origenMarcacionEnum = pgEnum("origen_marcacion", [
  "KIOSKO",
  "KIOSKO_OFFLINE",
  "MANUAL",
  "MIGRACION",
]);
export const tipoAjusteFestivoEnum = pgEnum("tipo_ajuste_festivo", ["AGREGAR", "QUITAR"]);
export const categoriaHoraEnum = pgEnum("categoria_hora", CATEGORIAS);

const tiempos = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const usuarios = pgTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    rol: rolEnum("rol").notNull().default("SUPERVISOR"),
    activo: boolean("activo").notNull().default(true),
    ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
    ...tiempos,
  },
  (t) => [uniqueIndex("usuarios_email_uq").on(sql`lower(${t.email})`)],
);

export const empleados = pgTable(
  "empleados",
  {
    id: serial("id").primaryKey(),
    identificacion: text("identificacion").notNull(),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    cargo: text("cargo"),
    email: text("email"),
    telefono: text("telefono"),
    salario: numeric("salario", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Jornada ordinaria diaria pactada en minutos. NULL = jornada legal vigente / 6. */
    minutosJornadaDia: integer("minutos_jornada_dia"),
    fechaIngreso: date("fecha_ingreso"),
    activo: boolean("activo").notNull().default(true),
    ...tiempos,
  },
  (t) => [
    uniqueIndex("empleados_identificacion_uq").on(t.identificacion),
    check("empleados_salario_ck", sql`${t.salario} >= 0`),
    check(
      "empleados_jornada_ck",
      sql`${t.minutosJornadaDia} IS NULL OR (${t.minutosJornadaDia} BETWEEN 60 AND 720)`,
    ),
  ],
);

export const marcaciones = pgTable(
  "marcaciones",
  {
    id: serial("id").primaryKey(),
    empleadoId: integer("empleado_id")
      .notNull()
      .references(() => empleados.id, { onDelete: "restrict" }),
    entrada: timestamp("entrada", { withTimezone: true }).notNull(),
    salida: timestamp("salida", { withTimezone: true }),
    estado: estadoMarcacionEnum("estado").notNull().default("ABIERTA"),
    origen: origenMarcacionEnum("origen").notNull().default("KIOSKO"),
    observacion: text("observacion"),
    minutosTotales: integer("minutos_totales"),
    minutosExtra: integer("minutos_extra"),
    valorRecargos: numeric("valor_recargos", { precision: 14, scale: 2, mode: "number" }),
    alertas: jsonb("alertas").$type<string[]>().notNull().default([]),
    creadoPor: integer("creado_por").references(() => usuarios.id, { onDelete: "set null" }),
    ...tiempos,
  },
  (t) => [
    index("marcaciones_empleado_entrada_idx").on(t.empleadoId, t.entrada),
    index("marcaciones_entrada_idx").on(t.entrada),
    index("marcaciones_estado_idx").on(t.estado),
    // Un empleado solo puede tener una marcación abierta a la vez.
    uniqueIndex("marcaciones_una_abierta_uq")
      .on(t.empleadoId)
      .where(sql`${t.estado} = 'ABIERTA'`),
    check("marcaciones_salida_ck", sql`${t.salida} IS NULL OR ${t.salida} >= ${t.entrada}`),
  ],
);

export const liquidacionLineas = pgTable(
  "liquidacion_lineas",
  {
    id: serial("id").primaryKey(),
    marcacionId: integer("marcacion_id")
      .notNull()
      .references(() => marcaciones.id, { onDelete: "cascade" }),
    categoria: categoriaHoraEnum("categoria").notNull(),
    minutos: integer("minutos").notNull(),
    factor: numeric("factor", { precision: 6, scale: 4, mode: "number" }).notNull(),
    valorHora: numeric("valor_hora", { precision: 14, scale: 2, mode: "number" }).notNull(),
    valor: numeric("valor", { precision: 14, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [index("liquidacion_lineas_marcacion_idx").on(t.marcacionId)],
);

export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id").notNull(),
    accion: text("accion").notNull(),
    motivo: text("motivo"),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_entidad_idx").on(t.entidad, t.entidadId)],
);

export const festivosAjustes = pgTable("festivos_ajustes", {
  fecha: date("fecha").primaryKey(),
  tipo: tipoAjusteFestivoEnum("tipo").notNull(),
  descripcion: text("descripcion"),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export type Usuario = typeof usuarios.$inferSelect;
export type Empleado = typeof empleados.$inferSelect;
export type Marcacion = typeof marcaciones.$inferSelect;
