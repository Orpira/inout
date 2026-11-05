import { type HorarioTurno, fechaLocal, lunesDeSemana, sumarDias, validarHorario, validarProgramacion } from '@inout/core';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { empleados, programacion, turnos } from '../db/schema.js';
import { ErrorHttp, type Tx, auditar, validar, zFecha, zHora, zId, zMotivo, zRango } from './comun.js';

const zHorario = z.object({
  horaInicio: zHora,
  horaFin: zHora,
  descansoInicio: zHora.nullable(),
  descansoFin: zHora.nullable(),
});
const zTurno = zHorario.extend({ nombre: z.string().trim().min(2).max(60) });

function comprobarHorario(h: HorarioTurno) {
  const error = validarHorario(h);
  if (error) throw new ErrorHttp(400, error);
}

const duplicado = (err: { code?: string; cause?: { code?: string } }) => {
  if (err.code === '23505' || err.cause?.code === '23505') throw new ErrorHttp(409, 'Ya existe un turno con ese nombre');
  throw err;
};

/** Programación del empleado para la semana (lunes a domingo) de `lunes`. */
async function semanaDe(tx: Tx, empleadoId: number, lunes: string) {
  return tx
    .select()
    .from(programacion)
    .where(and(eq(programacion.empleadoId, empleadoId), gte(programacion.fecha, lunes), lte(programacion.fecha, sumarDias(lunes, 6))));
}

export const horarioDeFila = (f: typeof programacion.$inferSelect): HorarioTurno | null =>
  f.horaInicio && f.horaFin ? { horaInicio: f.horaInicio, horaFin: f.horaFin, descansoInicio: f.descansoInicio, descansoFin: f.descansoFin } : null;

export function rutasTurnos(app: FastifyInstance, db: Db) {
  // --- Catálogo ---
  app.get('/api/turnos', { preHandler: requiereRol() }, async () => db.select().from(turnos).orderBy(asc(turnos.horaInicio), asc(turnos.nombre)));

  app.post('/api/turnos', { preHandler: requiereRol('ADMIN') }, async (req, reply) => {
    const datos = validar(zTurno, req.body);
    comprobarHorario(datos);
    const creado = await db
      .transaction(async (tx) => {
        const [t] = await tx.insert(turnos).values(datos).returning();
        await auditar(tx, { tabla: 'turnos', registroId: t!.id, usuarioId: req.user.id, motivo: 'Alta de turno', antes: null, despues: datos });
        return t;
      })
      .catch(duplicado);
    return reply.code(201).send(creado);
  });

  // Cambiar un turno solo afecta a lo que se programe después: la programación guarda su propia copia del horario.
  app.patch('/api/turnos/:id', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const { id } = validar(zId, req.params);
    const { motivo, ...cambios } = validar(zTurno.extend({ activo: z.boolean() }).partial().extend({ motivo: zMotivo }), req.body);
    if (!Object.keys(cambios).length) throw new ErrorHttp(400, 'No hay cambios');
    return db
      .transaction(async (tx) => {
        const [antes] = await tx.select().from(turnos).where(eq(turnos.id, id)).for('update');
        if (!antes) throw new ErrorHttp(404, 'Turno no encontrado');
        comprobarHorario({ ...antes, ...cambios });
        const [despues] = await tx.update(turnos).set(cambios).where(eq(turnos.id, id)).returning();
        await auditar(tx, { tabla: 'turnos', registroId: id, usuarioId: req.user.id, motivo, antes, despues });
        return despues;
      })
      .catch(duplicado);
  });

  // --- Programación ---
  app.get('/api/programacion', { preHandler: requiereRol() }, async (req) => {
    const q = validar(zRango(62).and(z.object({ empleadoId: z.coerce.number().int().positive().optional() })), req.query);
    return db
      .select()
      .from(programacion)
      .where(
        and(
          gte(programacion.fecha, q.desde),
          lte(programacion.fecha, q.hasta),
          q.empleadoId ? eq(programacion.empleadoId, q.empleadoId) : undefined,
        ),
      );
  });

  /**
   * Aplica cambios de programación en bloque y valida la semana completa de
   * cada empleado afectado (jornada máxima, día de descanso). Si alguna semana
   * incumple, no se guarda nada.
   * turnoId: número = asignar turno; 'DESCANSO' = día de descanso; null = quitar.
   * Cambiar días ya pasados exige motivo: altera liquidaciones.
   */
  app.put('/api/programacion', { preHandler: requiereRol() }, async (req) => {
    const { cambios, motivo } = validar(
      z.object({
        cambios: z
          .array(z.object({ empleadoId: z.number().int().positive(), fecha: zFecha, turnoId: z.union([z.number().int().positive(), z.literal('DESCANSO'), z.null()]) }))
          .min(1)
          .max(1000),
        motivo: zMotivo.optional(),
      }),
      req.body,
    );
    const hoy = fechaLocal(new Date());
    if (!motivo && cambios.some((c) => c.fecha < hoy)) throw new ErrorHttp(400, 'Hay días ya pasados: cambiar su programación altera la liquidación y exige un motivo');

    const ids = [...new Set(cambios.flatMap((c) => (typeof c.turnoId === 'number' ? [c.turnoId] : [])))];
    const catalogo = ids.length ? await db.select().from(turnos).where(inArray(turnos.id, ids)) : [];

    return db.transaction(async (tx) => {
      const semanas = new Set<string>();
      for (const c of cambios) {
        const clave = and(eq(programacion.empleadoId, c.empleadoId), eq(programacion.fecha, c.fecha));
        const [antes] = await tx.select().from(programacion).where(clave).for('update');
        let despues: typeof programacion.$inferInsert | null = null;
        if (c.turnoId === 'DESCANSO') despues = { empleadoId: c.empleadoId, fecha: c.fecha };
        else if (c.turnoId !== null) {
          const t = catalogo.find((x) => x.id === c.turnoId);
          if (!t) throw new ErrorHttp(400, `El turno ${c.turnoId} no existe`);
          if (!t.activo && antes?.turnoId !== t.id) throw new ErrorHttp(400, `El turno «${t.nombre}» está inactivo`);
          despues = {
            empleadoId: c.empleadoId,
            fecha: c.fecha,
            turnoId: t.id,
            horaInicio: t.horaInicio,
            horaFin: t.horaFin,
            descansoInicio: t.descansoInicio,
            descansoFin: t.descansoFin,
          };
        }
        const igual = (antes?.turnoId ?? 'X') === (despues?.turnoId ?? 'X') && !!antes === !!despues;
        if (igual) continue;

        if (antes) await tx.delete(programacion).where(clave);
        if (despues) await tx.insert(programacion).values(despues);
        await auditar(tx, {
          tabla: 'programacion',
          registroId: `${c.empleadoId}:${c.fecha}`,
          usuarioId: req.user.id,
          motivo: motivo ?? 'Programación de turnos',
          antes: antes ?? null,
          despues,
        });
        semanas.add(`${c.empleadoId}|${lunesDeSemana(c.fecha)}`);
      }

      const errores: string[] = [];
      const avisos: string[] = [];
      const idsEmp = [...new Set(cambios.map((c) => c.empleadoId))];
      const nombres = new Map(
        (await tx.select({ id: empleados.id, nombre: empleados.nombre }).from(empleados).where(inArray(empleados.id, idsEmp))).map((e) => [e.id, e.nombre]),
      );
      for (const s of semanas) {
        const [id, lunes] = s.split('|') as [string, string];
        const empleadoId = Number(id);
        const nombre = nombres.get(empleadoId) ?? `Empleado ${empleadoId}`;
        const filas = await semanaDe(tx, empleadoId, lunes);
        const r = validarProgramacion(filas.map((f) => ({ fecha: f.fecha, horario: horarioDeFila(f) })));
        errores.push(...r.errores.map((e) => `${nombre} · ${e}`));
        avisos.push(...r.avisos.map((a) => `${nombre} · ${a}`));
      }
      if (errores.length) throw new ErrorHttp(422, errores.join('\n'));
      return { cambios: semanas.size, avisos };
    });
  });
}
