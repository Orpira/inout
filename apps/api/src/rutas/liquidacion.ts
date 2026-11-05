import {
  CATEGORIAS,
  Calendario,
  type Minutos,
  desdeLocal,
  fechaLocal,
  liquidar,
  lunesDeSemana,
  programacionEntre,
  sumarDias,
  valorAdicionalDia,
} from '@inout/core';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { ajustesFestivos, empleados, horarios, marcaciones } from '../db/schema.js';
import { validar, zRango } from './comun.js';
import { versionDeFila } from './turnos.js';

export async function cargarCalendario(db: Db) {
  const ajustes = await db.select().from(ajustesFestivos);
  return new Calendario(ajustes.map((a) => ({ fecha: a.fecha, tipo: a.tipo, nombre: a.nombre ?? undefined })));
}

/**
 * Liquidación de un periodo. Se liquidan los turnos CERRADOS cuyo día de
 * jornada cae en el periodo (fechas de Colombia), con la jornada que marque el
 * horario fijo vigente del empleado. Los que siguen ABIERTOS o en REVISION se informan
 * como pendientes y no suman.
 *
 * Se consulta un día de margen a cada lado: un turno nocturno empezado pasada
 * la medianoche pertenece al día programado anterior.
 *
 * SUPUESTO PENDIENTE (nómina): se usa el salario actual del empleado.
 */
export function rutasLiquidacion(app: FastifyInstance, db: Db) {
  app.get('/api/liquidacion', { preHandler: requiereRol() }, async (req) => {
    const q = validar(zRango(62).and(z.object({ empleadoId: z.coerce.number().int().positive().optional() })), req.query);
    const inicio = desdeLocal(q.desde);
    const fin = desdeLocal(sumarDias(q.hasta, 1));
    const enPeriodo = (f: string) => f >= q.desde && f <= q.hasta;

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
          gte(marcaciones.entrada, desdeLocal(sumarDias(q.desde, -1))),
          lt(marcaciones.entrada, desdeLocal(sumarDias(q.hasta, 2))),
        ),
      );
    const versiones = await db.select().from(horarios).where(inArray(horarios.empleadoId, lista.map((e) => e.id)));
    const calendario = await cargarCalendario(db);

    const resultado = lista.map((emp) => {
      const propias = filas.filter((m) => m.empleadoId === emp.id);
      const cerradas = propias.filter((m) => m.estado === 'CERRADA' && m.salida);
      const pendientes = propias.filter((m) => m.estado !== 'CERRADA' && m.entrada >= inicio && m.entrada < fin);
      const plan = programacionEntre(
        versiones.filter((v) => v.empleadoId === emp.id).map(versionDeFila),
        sumarDias(q.desde, -1),
        sumarDias(q.hasta, 1),
      );
      const liquidacion = liquidar(
        cerradas.map((m) => ({ entrada: m.entrada, salida: m.salida! })),
        { calendario, jornadaPactadaMin: emp.jornadaPactadaMin ?? undefined, programacion: plan, diaDescanso: emp.diaDescanso },
      );
      // Un día con marcación pendiente no es ausencia: falta cerrarla.
      const conPendiente = new Set(pendientes.map((m) => fechaLocal(m.entrada)));
      const dias = liquidacion.dias
        .filter((d) => enPeriodo(d.fecha))
        .map((d) => (d.ausente && conPendiente.has(d.fecha) ? { ...d, ausente: false } : d));
      const semanas = liquidacion.semanas;
      const totales = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Minutos;
      for (const d of dias) for (const c of CATEGORIAS) totales[c] += d.minutos[c];
      const diasValorados = dias.map((d) => ({ ...d, valorAdicional: valorAdicionalDia(d, emp.salarioMensual) }));
      return {
        empleado: { id: emp.id, nombre: emp.nombre, documento: emp.documento, salarioMensual: emp.salarioMensual, activo: emp.activo, diaDescanso: emp.diaDescanso },
        totales,
        totalMin: dias.reduce((s, d) => s + d.totalMin, 0),
        extrasMin: dias.reduce((s, d) => s + d.extrasMin, 0),
        valorAdicional: diasValorados.reduce((s, d) => s + d.valorAdicional, 0),
        pendientes: pendientes.length,
        cumplimiento: {
          ausencias: dias.filter((d) => d.ausente).map((d) => d.fecha),
          tardanzas: dias.filter((d) => d.tardanzaMin > 0).length,
          tardanzaMin: dias.reduce((s, d) => s + d.tardanzaMin, 0),
          salidasAnticipadas: dias.filter((d) => d.salidaAnticipadaMin > 0).length,
          trabajoEnDescanso: dias.filter((d) => d.programado?.tipo === 'DESCANSO' && d.totalMin > 0).map((d) => d.fecha),
        },
        alertas: {
          dias: dias.filter((d) => d.alertaExtrasDia).map((d) => d.fecha),
          semanas: semanas.filter((s) => s.alertaExtrasSemana && dias.some((d) => lunesDeSemana(d.fecha) === s.lunes)).map((s) => s.lunes),
        },
        dias: diasValorados,
      };
    });

    // Sin actividad ni pendientes no aporta nada al informe general.
    const empleadosConDatos = q.empleadoId ? resultado : resultado.filter((r) => r.totalMin > 0 || r.pendientes > 0 || r.cumplimiento.ausencias.length > 0);
    return { desde: q.desde, hasta: q.hasta, empleados: empleadosConDatos };
  });
}
