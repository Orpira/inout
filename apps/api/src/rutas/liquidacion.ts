import {
  CATEGORIAS,
  Calendario,
  type Minutos,
  desdeLocal,
  liquidar,
  sumarDias,
  valorAdicionalDia,
} from '@inout/core';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { ajustesFestivos, empleados, marcaciones } from '../db/schema.js';
import { validar, zRango } from './comun.js';

export async function cargarCalendario(db: Db) {
  const ajustes = await db.select().from(ajustesFestivos);
  return new Calendario(ajustes.map((a) => ({ fecha: a.fecha, tipo: a.tipo, nombre: a.nombre ?? undefined })));
}

/**
 * Liquidación de un periodo. Se liquidan los turnos CERRADOS cuya entrada cae
 * en el periodo (fechas de Colombia). Los que siguen ABIERTOS o en REVISION se
 * informan como pendientes y no suman.
 *
 * SUPUESTO PENDIENTE (nómina): se usa el salario actual del empleado.
 */
export function rutasLiquidacion(app: FastifyInstance, db: Db) {
  app.get('/api/liquidacion', { preHandler: requiereRol() }, async (req) => {
    const q = validar(zRango(62).and(z.object({ empleadoId: z.coerce.number().int().positive().optional() })), req.query);
    const inicio = desdeLocal(q.desde);
    const fin = desdeLocal(sumarDias(q.hasta, 1));

    const filtroEmp = q.empleadoId ? eq(empleados.id, q.empleadoId) : undefined;
    const lista = await db.select().from(empleados).where(filtroEmp).orderBy(asc(empleados.nombre));
    if (!lista.length) return { desde: q.desde, hasta: q.hasta, empleados: [] };

    const filas = await db
      .select()
      .from(marcaciones)
      .where(
        and(
          inArray(marcaciones.empleadoId, lista.map((e) => e.id)),
          inArray(marcaciones.estado, ['CERRADA', 'ABIERTA', 'REVISION']),
          gte(marcaciones.entrada, inicio),
          lt(marcaciones.entrada, fin),
        ),
      );
    const calendario = await cargarCalendario(db);

    const resultado = lista.map((emp) => {
      const propias = filas.filter((m) => m.empleadoId === emp.id);
      const cerradas = propias.filter((m) => m.estado === 'CERRADA' && m.salida);
      const { dias, semanas } = liquidar(
        cerradas.map((m) => ({ entrada: m.entrada, salida: m.salida! })),
        { calendario, jornadaPactadaMin: emp.jornadaPactadaMin ?? undefined },
      );
      const totales = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Minutos;
      for (const d of dias) for (const c of CATEGORIAS) totales[c] += d.minutos[c];
      const diasValorados = dias.map((d) => ({ ...d, valorAdicional: valorAdicionalDia(d, emp.salarioMensual) }));
      return {
        empleado: { id: emp.id, nombre: emp.nombre, documento: emp.documento, salarioMensual: emp.salarioMensual, activo: emp.activo },
        totales,
        totalMin: dias.reduce((s, d) => s + d.totalMin, 0),
        extrasMin: dias.reduce((s, d) => s + d.extrasMin, 0),
        valorAdicional: diasValorados.reduce((s, d) => s + d.valorAdicional, 0),
        pendientes: propias.length - cerradas.length,
        alertas: {
          dias: dias.filter((d) => d.alertaExtrasDia).map((d) => d.fecha),
          semanas: semanas.filter((s) => s.alertaExtrasSemana).map((s) => s.lunes),
        },
        dias: diasValorados,
      };
    });

    // Sin actividad ni pendientes no aporta nada al informe general.
    const empleadosConDatos = q.empleadoId ? resultado : resultado.filter((r) => r.totalMin > 0 || r.pendientes > 0);
    return { desde: q.desde, hasta: q.hasta, empleados: empleadosConDatos };
  });
}
