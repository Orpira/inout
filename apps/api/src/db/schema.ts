import { CATEGORIAS, type Descanso, type DiaHorario } from "@inout/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
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
  uuid,
} from "drizzle-orm/pg-core";

export const rolEnum = pgEnum("rol", ["ADMIN", "SUPERVISOR", "CONSULTA"]);
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
export const tipoHorarioEnum = pgEnum("tipo_horario", ["FIJO", "TURNOS"]);
export const estadoExtrasEnum = pgEnum("estado_extras", [
  "SIN_EXTRAS",
  "TOLERANCIA",
  "PENDIENTE",
  "APROBADAS",
  "RECHAZADAS",
  "AUTOMATICAS",
]);

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

export const horarios = pgTable("horarios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: tipoHorarioEnum("tipo").notNull(),
  /** 7 elementos, índice 0 = domingo. */
  dias: jsonb("dias").$type<DiaHorario[]>().notNull(),
  descanso: jsonb("descanso").$type<Descanso | null>(),
  toleranciaMinutos: integer("tolerancia_minutos").notNull().default(0),
  requiereAprobacion: boolean("requiere_aprobacion").notNull().default(false),
  /** Sucursal donde se trabaja este turno. NULL = sirve en cualquier sucursal. */
  sucursalId: integer("sucursal_id").references(() => sucursales.id, { onDelete: "restrict" }),
  activo: boolean("activo").notNull().default(true),
  ...tiempos,
});

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
    /** Horario asignado. NULL = jornada legal en 6 días (lunes a sábado). */
    horarioId: integer("horario_id").references(() => horarios.id, { onDelete: "restrict" }),
    /** Sucursal (centro de costo) base. Puede cubrir turnos en otras. */
    sucursalId: integer("sucursal_id").references(() => sucursales.id, { onDelete: "restrict" }),
    fechaIngreso: date("fecha_ingreso"),
    activo: boolean("activo").notNull().default(true),
    ...tiempos,
  },
  (t) => [
    uniqueIndex("empleados_identificacion_uq").on(t.identificacion),
    check("empleados_salario_ck", sql`${t.salario} >= 0`),
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
    /** La salida la puso el sistema con la hora del horario porque el empleado no la marcó. */
    salidaAutomatica: boolean("salida_automatica").notNull().default(false),
    /** Entrada marcada después de cerrar el turno del mismo día en la misma sucursal: al cerrarse va a revisión y la aprueba un supervisor. */
    reingreso: boolean("reingreso").notNull().default(false),
    /** Sucursal (centro de costo) donde se trabajó: a ella se imputan las horas en la liquidación. */
    sucursalId: integer("sucursal_id").references(() => sucursales.id, { onDelete: "restrict" }),
    /** Turno elegido al cubrir otra sucursal. NULL = el horario asignado al empleado. Rige la jornada de ese día. */
    horarioId: integer("horario_id").references(() => horarios.id, { onDelete: "restrict" }),
    /** Ubicación del kiosko al marcar la entrada (si el dispositivo la dio), solo para verificación. */
    latitud: doublePrecision("latitud"),
    longitud: doublePrecision("longitud"),
    precisionMetros: integer("precision_metros"),
    /** Distancia a la sede de la sucursal; se avisa si supera el radio configurado. */
    distanciaSedeMetros: integer("distancia_sede_metros"),
    minutosTotales: integer("minutos_totales"),
    /** Extras liquidadas (reconocidas). */
    minutosExtra: integer("minutos_extra"),
    /** Extras resultantes de las marcaciones, antes de aprobación o tolerancia. */
    minutosExtraCalculados: integer("minutos_extra_calculados"),
    minutosDescanso: integer("minutos_descanso"),
    estadoExtras: estadoExtrasEnum("estado_extras"),
    /** Minutos extra aprobados por el supervisor (0 = rechazadas). */
    minutosExtraAprobados: integer("minutos_extra_aprobados"),
    extrasRevisadasPor: integer("extras_revisadas_por").references(() => usuarios.id, { onDelete: "set null" }),
    extrasRevisadasEn: timestamp("extras_revisadas_en", { withTimezone: true }),
    valorRecargos: numeric("valor_recargos", { precision: 14, scale: 2, mode: "number" }),
    alertas: jsonb("alertas").$type<string[]>().notNull().default([]),
    creadoPor: integer("creado_por").references(() => usuarios.id, { onDelete: "set null" }),
    ...tiempos,
  },
  (t) => [
    index("marcaciones_empleado_entrada_idx").on(t.empleadoId, t.entrada),
    index("marcaciones_entrada_idx").on(t.entrada),
    index("marcaciones_estado_idx").on(t.estado),
    index("marcaciones_estado_extras_idx").on(t.estadoExtras),
    index("marcaciones_sucursal_idx").on(t.sucursalId),
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

export const estadoMarcaOfflineEnum = pgEnum("estado_marca_offline", ["APLICADA", "RECHAZADA", "RESUELTA"]);

/**
 * Marcaciones capturadas por el kiosko sin conexión y enviadas al reconectar.
 * El id lo genera el dispositivo: reenviar la misma marca no la duplica.
 * Las rechazadas quedan aquí para que un supervisor las resuelva.
 */
export const marcasOffline = pgTable(
  "marcas_offline",
  {
    id: uuid("id").primaryKey(),
    codigo: text("codigo").notNull(),
    /** Hora de captura corregida con el desfase del reloj del dispositivo. */
    capturadoEn: timestamp("capturado_en", { withTimezone: true }).notNull(),
    /** Hora de captura según el reloj del dispositivo. */
    capturadoDispositivo: timestamp("capturado_dispositivo", { withTimezone: true }).notNull(),
    desfaseSegundos: integer("desfase_segundos").notNull().default(0),
    dispositivo: text("dispositivo"),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
    estado: estadoMarcaOfflineEnum("estado").notNull(),
    tipo: text("tipo"),
    mensaje: text("mensaje"),
    empleadoId: integer("empleado_id").references(() => empleados.id, { onDelete: "set null" }),
    marcacionId: integer("marcacion_id").references(() => marcaciones.id, { onDelete: "set null" }),
    resueltaPor: integer("resuelta_por").references(() => usuarios.id, { onDelete: "set null" }),
    resueltaEn: timestamp("resuelta_en", { withTimezone: true }),
    notaResolucion: text("nota_resolucion"),
  },
  (t) => [index("marcas_offline_estado_idx").on(t.estado, t.capturadoEn)],
);

export interface DetallePeriodo {
  empleadoId: number;
  identificacion: string;
  nombre: string;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  valorTotal: number;
}

export interface ResumenPeriodo {
  empleados: number;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  valorTotal: number;
}

/**
 * Periodos ya liquidados. Mientras un cierre está vigente (sin reabrir), las marcaciones
 * cuya entrada cae entre `desde` y `hasta` son de solo consulta.
 * Reabrir no borra la fila: queda como historial.
 * La migración añade una restricción de exclusión para que dos cierres vigentes no se solapen.
 */
export const periodosLiquidados = pgTable(
  "periodos_liquidados",
  {
    id: serial("id").primaryKey(),
    desde: date("desde").notNull(),
    hasta: date("hasta").notNull(),
    nota: text("nota"),
    /** Totales al momento del cierre. */
    resumen: jsonb("resumen").$type<ResumenPeriodo>().notNull(),
    /** Lo liquidado a cada empleado al momento del cierre: permite comparar si se vuelve a liquidar. */
    detalle: jsonb("detalle").$type<DetallePeriodo[]>().notNull().default([]),
    cerradoPor: integer("cerrado_por").references(() => usuarios.id, { onDelete: "set null" }),
    cerradoEn: timestamp("cerrado_en", { withTimezone: true }).notNull().defaultNow(),
    reabiertoPor: integer("reabierto_por").references(() => usuarios.id, { onDelete: "set null" }),
    reabiertoEn: timestamp("reabierto_en", { withTimezone: true }),
    motivoReapertura: text("motivo_reapertura"),
  },
  (t) => [
    index("periodos_liquidados_rango_idx").on(t.desde, t.hasta),
    check("periodos_liquidados_rango_ck", sql`${t.hasta} >= ${t.desde}`),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type PeriodoLiquidado = typeof periodosLiquidados.$inferSelect;
export type Empleado = typeof empleados.$inferSelect;
export type Marcacion = typeof marcaciones.$inferSelect;
export type HorarioFila = typeof horarios.$inferSelect;

/** Datos de la empresa (un único registro, id = 1). Encabezan reportes y exportaciones. */
export const empresa = pgTable(
  "empresa",
  {
    id: integer("id").primaryKey().default(1),
    nombre: text("nombre").notNull(),
    nit: text("nit"),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("empresa_unica", sql`${t.id} = 1`)],
);

/** Sucursales o centros de costo. No se borran: se desactivan, porque las marcaciones las referenciarán. */
export const sucursales = pgTable(
  "sucursales",
  {
    id: serial("id").primaryKey(),
    /** Código del centro de costo en nómina/contabilidad. */
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    ciudad: text("ciudad"),
    direccion: text("direccion"),
    /** Ubicación de la sede: sirve para proponer la sucursal al autorizar un kiosko y para verificar dónde se marca. */
    latitud: doublePrecision("latitud"),
    longitud: doublePrecision("longitud"),
    radioMetros: integer("radio_metros").notNull().default(300),
    activa: boolean("activa").notNull().default(true),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sucursales_codigo_uq").on(sql`lower(${t.codigo})`),
    uniqueIndex("sucursales_nombre_uq").on(sql`lower(${t.nombre})`),
    check("sucursales_coordenadas", sql`(${t.latitud} is null) = (${t.longitud} is null)`),
  ],
);
