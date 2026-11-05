import { type HorarioTurno, type VersionHorario, fechaLocal, validarHorario, validarSemanaTipo } from '@inout/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { type DiaHorario, empleados, horarios, turnos } from '../db/schema.js';
import { ErrorHttp, auditar, validar, zFecha, zHora, zId, zMotivo } from './comun.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

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

/** Versión de horario de la BD → versión para @inout/core. */
export const versionDeFila = (f: typeof horarios.$inferSelect): VersionHorario => ({ vigenteDesde: f.vigenteDesde, semana: f.semana });

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

  // Cambiar un turno solo afecta a los horarios que se asignen después: cada horario guarda su copia.
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

  // --- Horarios fijos de los empleados ---
  app.get('/api/horarios', { preHandler: requiereRol() }, async () =>
    db.select().from(horarios).orderBy(asc(horarios.empleadoId), asc(horarios.vigenteDesde)),
  );

  /**
   * Asigna (o cambia) el horario fijo de un empleado desde una fecha. Si ya
   * hay una versión con esa misma fecha, se reemplaza. Una fecha ya pasada
   * cambia liquidaciones y exige motivo.
   */
  app.post('/api/horarios', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const d = validar(
      z.object({
        empleadoId: z.number().int().positive(),
        vigenteDesde: zFecha,
        /** Índice 0 = domingo … 6 = sábado; id de turno o 'DESCANSO'. */
        semana: z.array(z.union([z.number().int().positive(), z.literal('DESCANSO')])).length(7),
        motivo: zMotivo.optional(),
      }),
      req.body,
    );
    if (!d.motivo && d.vigenteDesde < fechaLocal(new Date())) throw new ErrorHttp(400, 'La fecha ya pasó: el cambio altera liquidaciones y exige un motivo');

    const ids = [...new Set(d.semana.filter((x) => x !== 'DESCANSO'))];
    const catalogo = ids.length ? await db.select().from(turnos).where(inArray(turnos.id, ids)) : [];
    const semana: (DiaHorario | null)[] = d.semana.map((x) => {
      if (x === 'DESCANSO') return null;
      const t = catalogo.find((c) => c.id === x);
      if (!t) throw new ErrorHttp(400, `El turno ${x} no existe`);
      if (!t.activo) throw new ErrorHttp(400, `El turno «${t.nombre}» está inactivo`);
      return { turnoId: t.id, nombre: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin, descansoInicio: t.descansoInicio, descansoFin: t.descansoFin };
    });

    const r = validarSemanaTipo(semana, d.vigenteDesde);
    if (r.errores.length) throw new ErrorHttp(422, r.errores.join('\n'));

    return db.transaction(async (tx) => {
      const [emp] = await tx.select().from(empleados).where(eq(empleados.id, d.empleadoId));
      if (!emp) throw new ErrorHttp(404, 'Empleado no encontrado');
      const avisos = [...r.avisos];
      if (semana[emp.diaDescanso])
        avisos.push(`Trabaja su día de descanso obligatorio (${DIAS[emp.diaDescanso]}): cada semana se paga con recargo dominical. Revise el día de descanso en Empleados.`);

      const clave = and(eq(horarios.empleadoId, d.empleadoId), eq(horarios.vigenteDesde, d.vigenteDesde));
      const [antes] = await tx.select().from(horarios).where(clave).for('update');
      if (antes) await tx.update(horarios).set({ semana, creadoEn: new Date() }).where(clave);
      else await tx.insert(horarios).values({ empleadoId: d.empleadoId, vigenteDesde: d.vigenteDesde, semana });
      await auditar(tx, {
        tabla: 'horarios',
        registroId: `${d.empleadoId}:${d.vigenteDesde}`,
        usuarioId: req.user.id,
        motivo: d.motivo ?? 'Asignación de horario',
        antes: antes ?? null,
        despues: { vigenteDesde: d.vigenteDesde, semana },
      });
      return { avisos };
    });
  });

  app.delete('/api/horarios/:empleadoId/:vigenteDesde', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const p = validar(z.object({ empleadoId: z.coerce.number().int().positive(), vigenteDesde: zFecha }), req.params);
    const { motivo } = validar(z.object({ motivo: zMotivo }), req.body);
    return db.transaction(async (tx) => {
      const clave = and(eq(horarios.empleadoId, p.empleadoId), eq(horarios.vigenteDesde, p.vigenteDesde));
      const [antes] = await tx.delete(horarios).where(clave).returning();
      if (!antes) throw new ErrorHttp(404, 'Versión de horario no encontrada');
      await auditar(tx, { tabla: 'horarios', registroId: `${p.empleadoId}:${p.vigenteDesde}`, usuarioId: req.user.id, motivo, antes, despues: null });
      return { ok: true };
    });
  });
}
