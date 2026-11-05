import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Convención de tiempo:
 * - Instantes (entrada, salida, creado_en…) → `timestamptz`. PostgreSQL los
 *   guarda en UTC; la conversión a hora de Colombia la hace @inout/core.
 * - Fechas civiles (festivos) → `date` leído como texto 'YYYY-MM-DD', nunca
 *   como Date de JS (evita corrimientos por la zona del servidor).
 */
const instante = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: 'date' });

export const rolUsuario = pgEnum('rol_usuario', ['ADMIN', 'SUPERVISOR']);
export const estadoMarcacion = pgEnum('estado_marcacion', ['ABIERTA', 'CERRADA', 'REVISION', 'ANULADA']);
export const tipoAjusteFestivo = pgEnum('tipo_ajuste_festivo', ['AGREGAR', 'QUITAR']);

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  hashClave: text('hash_clave').notNull(),
  rol: rolUsuario('rol').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

export const empleados = pgTable('empleados', {
  id: serial('id').primaryKey(),
  documento: text('documento').notNull().unique(),
  nombre: text('nombre').notNull(),
  /** Salario mensual en pesos colombianos. */
  salarioMensual: integer('salario_mensual').notNull(),
  /** Jornada diaria pactada en minutos; null = jornada legal ÷ 6. */
  jornadaPactadaMin: integer('jornada_pactada_min'),
  /** Día de descanso obligatorio: 0 = domingo … 6 = sábado (CST art. 179, pacto escrito si no es domingo). */
  diaDescanso: integer('dia_descanso').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

export const marcaciones = pgTable(
  'marcaciones',
  {
    id: serial('id').primaryKey(),
    empleadoId: integer('empleado_id')
      .notNull()
      .references(() => empleados.id),
    entrada: instante('entrada').notNull(),
    salida: instante('salida'),
    estado: estadoMarcacion('estado').notNull().default('ABIERTA'),
    creadoEn: instante('creado_en').notNull().defaultNow(),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [
    // Un empleado no puede tener dos marcaciones abiertas a la vez.
    uniqueIndex('marcaciones_una_abierta').on(t.empleadoId).where(sql`${t.estado} = 'ABIERTA'`),
    index('marcaciones_empleado_entrada').on(t.empleadoId, t.entrada),
  ],
);

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  tabla: text('tabla').notNull(),
  /** Id del registro afectado (texto: hay tablas con clave fecha). */
  registroId: text('registro_id').notNull(),
  /** null = acción del sistema (p. ej. paso automático a REVISION). */
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  motivo: text('motivo').notNull(),
  antes: jsonb('antes'),
  despues: jsonb('despues'),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

export const ajustesFestivos = pgTable('ajustes_festivos', {
  fecha: date('fecha', { mode: 'string' }).primaryKey(),
  tipo: tipoAjusteFestivo('tipo').notNull(),
  nombre: text('nombre'),
});

/** Catálogo de turnos. Horas en Colombia 'HH:MM'; fin <= inicio = termina al día siguiente. */
export const turnos = pgTable('turnos', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull().unique(),
  horaInicio: text('hora_inicio').notNull(),
  horaFin: text('hora_fin').notNull(),
  descansoInicio: text('descanso_inicio'),
  descansoFin: text('descanso_fin'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

/**
 * Programación: un registro por empleado y día. Copia el horario del turno
 * (cambiar el catálogo no altera lo ya programado ni las liquidaciones).
 * Sin turno ni horas = día de descanso programado.
 */
export const programacion = pgTable(
  'programacion',
  {
    empleadoId: integer('empleado_id')
      .notNull()
      .references(() => empleados.id),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    turnoId: integer('turno_id').references(() => turnos.id),
    horaInicio: text('hora_inicio'),
    horaFin: text('hora_fin'),
    descansoInicio: text('descanso_inicio'),
    descansoFin: text('descanso_fin'),
    actualizadoEn: instante('actualizado_en').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.empleadoId, t.fecha] }), index('programacion_fecha').on(t.fecha)],
);
