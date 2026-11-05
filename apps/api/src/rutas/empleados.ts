import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { empleados } from '../db/schema.js';
import { ErrorHttp, auditar, validar, zId, zMotivo } from './comun.js';

const zDatos = z.object({
  documento: z.string().trim().regex(/^\d{3,20}$/, 'solo dígitos (3 a 20)'),
  nombre: z.string().trim().min(3).max(120),
  salarioMensual: z.number().int().positive(),
  /** Minutos diarios pactados; null = jornada legal ÷ 6. */
  jornadaPactadaMin: z.number().int().min(60).max(600).nullable(),
  activo: z.boolean(),
});

export function rutasEmpleados(app: FastifyInstance, db: Db) {
  app.get('/api/empleados', { preHandler: requiereRol() }, async () =>
    db.select().from(empleados).orderBy(asc(empleados.nombre)),
  );

  app.post('/api/empleados', { preHandler: requiereRol('ADMIN') }, async (req, reply) => {
    const datos = validar(zDatos, req.body);
    const creado = await db.transaction(async (tx) => {
      const [e] = await tx.insert(empleados).values(datos).onConflictDoNothing().returning();
      if (!e) throw new ErrorHttp(409, 'Ya existe un empleado con ese documento');
      await auditar(tx, { tabla: 'empleados', registroId: e.id, usuarioId: req.user.id, motivo: 'Alta de empleado', antes: null, despues: datos });
      return e;
    });
    return reply.code(201).send(creado);
  });

  app.patch('/api/empleados/:id', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const { id } = validar(zId, req.params);
    const { motivo, ...cambios } = validar(zDatos.partial().extend({ motivo: zMotivo }), req.body);
    if (!Object.keys(cambios).length) throw new ErrorHttp(400, 'No hay cambios');
    return db.transaction(async (tx) => {
      const [antes] = await tx.select().from(empleados).where(eq(empleados.id, id)).for('update');
      if (!antes) throw new ErrorHttp(404, 'Empleado no encontrado');
      const [despues] = await tx.update(empleados).set(cambios).where(eq(empleados.id, id)).returning();
      await auditar(tx, { tabla: 'empleados', registroId: id, usuarioId: req.user.id, motivo, antes, despues });
      return despues;
    }).catch((err: { code?: string; cause?: { code?: string } }) => {
      if (err.code === '23505' || err.cause?.code === '23505') throw new ErrorHttp(409, 'Ya existe un empleado con ese documento');
      throw err;
    });
  });
}
