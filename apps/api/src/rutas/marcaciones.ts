import { desdeLocal, sumarDias } from '@inout/core';
import { type SQL, and, asc, desc, eq, gte, lt, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { auditoria, empleados, marcaciones, usuarios } from '../db/schema.js';
import { validarTramo } from '../reglas.js';
import { ErrorHttp, type Tx, auditar, momento, validar, zId, zMomento, zMotivo, zRango } from './comun.js';

const ESTADOS = ['ABIERTA', 'CERRADA', 'REVISION', 'ANULADA'] as const;
type Marcacion = typeof marcaciones.$inferSelect;

function aJson(m: Marcacion & { empleado?: string }) {
  return { id: m.id, empleadoId: m.empleadoId, empleado: m.empleado, estado: m.estado, entrada: momento(m.entrada), salida: momento(m.salida) };
}

/** Registro para auditoría: instantes en ISO y en hora de Colombia. */
function instantanea(m: Pick<Marcacion, 'entrada' | 'salida' | 'estado'>) {
  return { estado: m.estado, entrada: momento(m.entrada), salida: momento(m.salida) };
}

/** Marcaciones vigentes del empleado alrededor de un tramo, para comprobar cruces. */
async function vecinas(tx: Tx, empleadoId: number, entrada: Date) {
  const margen = 2 * 86_400_000;
  return tx
    .select({ id: marcaciones.id, entrada: marcaciones.entrada, salida: marcaciones.salida })
    .from(marcaciones)
    .where(
      and(
        eq(marcaciones.empleadoId, empleadoId),
        ne(marcaciones.estado, 'ANULADA'),
        gte(marcaciones.entrada, new Date(entrada.getTime() - margen)),
        lt(marcaciones.entrada, new Date(entrada.getTime() + margen)),
      ),
    );
}

export function rutasMarcaciones(app: FastifyInstance, db: Db) {
  const lectura = { preHandler: requiereRol() };

  // Listado por rango de fechas de Colombia (por fecha de entrada).
  app.get('/api/marcaciones', lectura, async (req) => {
    const q = validar(
      zRango(93).and(
        z.object({ empleadoId: z.coerce.number().int().positive().optional(), estado: z.enum(ESTADOS).optional() }),
      ),
      req.query,
    );
    const filtros: SQL[] = [
      gte(marcaciones.entrada, desdeLocal(q.desde)),
      lt(marcaciones.entrada, desdeLocal(sumarDias(q.hasta, 1))),
    ];
    if (q.empleadoId) filtros.push(eq(marcaciones.empleadoId, q.empleadoId));
    if (q.estado) filtros.push(eq(marcaciones.estado, q.estado));
    const filas = await db
      .select({ m: marcaciones, empleado: empleados.nombre })
      .from(marcaciones)
      .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
      .where(and(...filtros))
      .orderBy(desc(marcaciones.entrada))
      .limit(2000);
    return filas.map((f) => aJson({ ...f.m, empleado: f.empleado }));
  });

  // Bandeja de revisión: todo lo que está en REVISION, sin límite de fechas.
  app.get('/api/marcaciones/revision', lectura, async () => {
    const filas = await db
      .select({ m: marcaciones, empleado: empleados.nombre })
      .from(marcaciones)
      .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
      .where(eq(marcaciones.estado, 'REVISION'))
      .orderBy(asc(marcaciones.entrada));
    return filas.map((f) => aJson({ ...f.m, empleado: f.empleado }));
  });

  // Alta manual (p. ej. el empleado olvidó marcar). Siempre con salida y motivo.
  app.post('/api/marcaciones', lectura, async (req, reply) => {
    const d = validar(
      z.object({ empleadoId: z.number().int().positive(), entrada: zMomento, salida: zMomento, motivo: zMotivo }),
      req.body,
    );
    const creada = await db.transaction(async (tx) => {
      const [emp] = await tx.select().from(empleados).where(eq(empleados.id, d.empleadoId)).for('update');
      if (!emp) throw new ErrorHttp(404, 'Empleado no encontrado');
      const error = validarTramo(d, await vecinas(tx, d.empleadoId, d.entrada));
      if (error) throw new ErrorHttp(422, error);
      const [m] = await tx
        .insert(marcaciones)
        .values({ empleadoId: d.empleadoId, entrada: d.entrada, salida: d.salida, estado: 'CERRADA' })
        .returning();
      await auditar(tx, { tabla: 'marcaciones', registroId: m!.id, usuarioId: req.user.id, motivo: d.motivo, antes: null, despues: instantanea(m!) });
      return m!;
    });
    return reply.code(201).send(aJson(creada));
  });

  /**
   * Corrección: cambia entrada y/o salida, o anula. Con salida queda CERRADA;
   * sin salida conserva ABIERTA o REVISION. Toda corrección exige motivo.
   */
  app.patch('/api/marcaciones/:id', lectura, async (req) => {
    const { id } = validar(zId, req.params);
    const d = validar(
      z.object({ entrada: zMomento.optional(), salida: zMomento.nullable().optional(), anular: z.boolean().optional(), motivo: zMotivo }),
      req.body,
    );
    const actualizada = await db.transaction(async (tx) => {
      const [antes] = await tx.select().from(marcaciones).where(eq(marcaciones.id, id)).for('update');
      if (!antes) throw new ErrorHttp(404, 'Marcación no encontrada');
      if (antes.estado === 'ANULADA') throw new ErrorHttp(409, 'La marcación está anulada');

      let cambios: Pick<Marcacion, 'entrada' | 'salida' | 'estado'>;
      if (d.anular) {
        cambios = { entrada: antes.entrada, salida: antes.salida, estado: 'ANULADA' };
      } else {
        const entrada = d.entrada ?? antes.entrada;
        const salida = d.salida === undefined ? antes.salida : d.salida;
        const estado = salida ? 'CERRADA' : antes.estado === 'ABIERTA' ? 'ABIERTA' : 'REVISION';
        const error = validarTramo({ id, entrada, salida }, await vecinas(tx, antes.empleadoId, entrada));
        if (error) throw new ErrorHttp(422, error);
        cambios = { entrada, salida, estado };
      }

      const [m] = await tx
        .update(marcaciones)
        .set({ ...cambios, actualizadoEn: new Date() })
        .where(eq(marcaciones.id, id))
        .returning();
      await auditar(tx, { tabla: 'marcaciones', registroId: id, usuarioId: req.user.id, motivo: d.motivo, antes: instantanea(antes), despues: instantanea(m!) });
      return m!;
    });
    return aJson(actualizada);
  });

  // Historial de cambios de un registro.
  app.get('/api/auditoria/:tabla/:id', lectura, async (req) => {
    const p = validar(z.object({ tabla: z.enum(['marcaciones', 'empleados', 'ajustes_festivos', 'usuarios']), id: z.string().max(20) }), req.params);
    const filas = await db
      .select({ a: auditoria, usuario: usuarios.nombre })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(and(eq(auditoria.tabla, p.tabla), eq(auditoria.registroId, p.id)))
      .orderBy(desc(auditoria.creadoEn));
    return filas.map((f) => ({ ...f.a, creadoEn: momento(f.a.creadoEn), usuario: f.usuario ?? 'Sistema' }));
  });
}
