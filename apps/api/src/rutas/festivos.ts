import { festivosBase, festivosDelAnio } from '@inout/core';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { ajustesFestivos } from '../db/schema.js';
import { ErrorHttp, auditar, validar, zFecha, zMotivo } from './comun.js';

export function rutasFestivos(app: FastifyInstance, db: Db) {
  app.get('/api/festivos/:anio', { preHandler: requiereRol() }, async (req) => {
    const { anio } = validar(z.object({ anio: z.coerce.number().int().min(2000).max(2100) }), req.params);
    const ajustes = await db
      .select()
      .from(ajustesFestivos)
      .where(and(gte(ajustesFestivos.fecha, `${anio}-01-01`), lte(ajustesFestivos.fecha, `${anio}-12-31`)))
      .orderBy(asc(ajustesFestivos.fecha));
    const delAnio = ajustes.map((a) => ({ fecha: a.fecha, tipo: a.tipo, nombre: a.nombre ?? undefined }));
    return {
      festivos: festivosDelAnio(anio, delAnio),
      /** Festivos de ley quitados desde el panel (siguen en la ley, no en el calendario aplicado). */
      quitados: festivosBase(anio).filter((f) => delAnio.some((a) => a.tipo === 'QUITAR' && a.fecha === f.fecha)),
      ajustes,
    };
  });

  app.put('/api/festivos/ajustes/:fecha', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const { fecha } = validar(z.object({ fecha: zFecha }), req.params);
    const d = validar(
      z.object({ tipo: z.enum(['AGREGAR', 'QUITAR']), nombre: z.string().trim().max(80).optional(), motivo: zMotivo }),
      req.body,
    );
    const esDeLey = festivosBase(Number(fecha.slice(0, 4))).some((f) => f.fecha === fecha);
    if (d.tipo === 'QUITAR' && !esDeLey) throw new ErrorHttp(422, 'Esa fecha no es festivo de ley; para quitar un festivo agregado, elimina el ajuste');
    if (d.tipo === 'AGREGAR' && esDeLey) throw new ErrorHttp(422, 'Esa fecha ya es festivo de ley');
    return db.transaction(async (tx) => {
      const [antes] = await tx.select().from(ajustesFestivos).where(eq(ajustesFestivos.fecha, fecha));
      const valores = { fecha, tipo: d.tipo, nombre: d.nombre ?? null };
      const [despues] = await tx
        .insert(ajustesFestivos)
        .values(valores)
        .onConflictDoUpdate({ target: ajustesFestivos.fecha, set: valores })
        .returning();
      await auditar(tx, { tabla: 'ajustes_festivos', registroId: fecha, usuarioId: req.user.id, motivo: d.motivo, antes: antes ?? null, despues });
      return despues;
    });
  });

  app.delete('/api/festivos/ajustes/:fecha', { preHandler: requiereRol('ADMIN') }, async (req) => {
    const { fecha } = validar(z.object({ fecha: zFecha }), req.params);
    const { motivo } = validar(z.object({ motivo: zMotivo }), req.body);
    return db.transaction(async (tx) => {
      const [antes] = await tx.delete(ajustesFestivos).where(eq(ajustesFestivos.fecha, fecha)).returning();
      if (!antes) throw new ErrorHttp(404, 'No hay ajuste para esa fecha');
      await auditar(tx, { tabla: 'ajustes_festivos', registroId: fecha, usuarioId: req.user.id, motivo, antes, despues: null });
      return { ok: true };
    });
  });
}
