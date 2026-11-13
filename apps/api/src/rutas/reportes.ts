import { CATEGORIAS, ETIQUETAS, desdeLocal, formatearMinutos, lunesDeSemana, MAX_EXTRA_SEMANA_MIN, sumarDias, type Categoria } from "@inout/core";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { empleados, liquidacionLineas, marcaciones } from "../db/schema.js";
import { solicitudInvalida } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { fechaISO } from "./marcaciones.js";

const rango = z.object({
  desde: fechaISO,
  hasta: fechaISO,
  empleadoId: z.coerce.number().int().optional(),
  formato: z.enum(["json", "csv"]).default("json"),
});

interface FilaReporte {
  empleadoId: number;
  identificacion: string;
  nombre: string;
  cargo: string | null;
  salario: number;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  minutosExtraPendientes: number;
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
  alertas: string[];
}

const csvCelda = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const aCsv = (filas: unknown[][]) => "﻿" + filas.map((f) => f.map(csvCelda).join(";")).join("\r\n");
const horas = (min: number) => (min / 60).toFixed(2).replace(".", ",");
const pesos = (v: number) => v.toFixed(2).replace(".", ",");

export const rutasReportes: Rutas = (app, { db }) => {
  const r = zapp(app);

  r.get("/liquidacion", { onRequest: requiereSesion(), schema: { querystring: rango } }, async (req, reply) => {
    const { desde, hasta, empleadoId, formato } = req.query;
    if (hasta < desde) throw solicitudInvalida("El rango de fechas es inválido.");
    const ini = desdeLocal(desde);
    const fin = desdeLocal(sumarDias(hasta, 1));
    const filtroMarc = and(
      eq(marcaciones.estado, "CERRADA"),
      gte(marcaciones.entrada, ini),
      lt(marcaciones.entrada, fin),
      empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
    );

    const [porCategoria, porEmpleado, porSemana] = await Promise.all([
      db
        .select({
          empleadoId: marcaciones.empleadoId,
          categoria: liquidacionLineas.categoria,
          minutos: sql<number>`sum(${liquidacionLineas.minutos})::int`,
          valor: sql<number>`sum(${liquidacionLineas.valor})::float8`,
        })
        .from(liquidacionLineas)
        .innerJoin(marcaciones, eq(marcaciones.id, liquidacionLineas.marcacionId))
        .where(filtroMarc)
        .groupBy(marcaciones.empleadoId, liquidacionLineas.categoria),
      db
        .select({
          empleadoId: empleados.id,
          identificacion: empleados.identificacion,
          nombre: sql<string>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
          cargo: empleados.cargo,
          salario: empleados.salario,
          turnos: sql<number>`count(*)::int`,
          minutosTotales: sql<number>`coalesce(sum(${marcaciones.minutosTotales}),0)::int`,
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
          minutosExtraPendientes: sql<number>`coalesce(sum(${marcaciones.minutosExtraCalculados}) filter (where ${marcaciones.estadoExtras} = 'PENDIENTE'),0)::int`,
          valorTotal: sql<number>`coalesce(sum(${marcaciones.valorRecargos}),0)::float8`,
        })
        .from(marcaciones)
        .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
        .where(filtroMarc)
        .groupBy(empleados.id)
        .orderBy(asc(empleados.apellido), asc(empleados.nombre)),
      db
        .select({
          empleadoId: marcaciones.empleadoId,
          fecha: sql<string>`to_char(${marcaciones.entrada} at time zone 'America/Bogota', 'YYYY-MM-DD')`,
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
        })
        .from(marcaciones)
        .where(filtroMarc)
        .groupBy(marcaciones.empleadoId, sql`2`),
    ]);

    const filas = new Map<number, FilaReporte>(
      porEmpleado.map((e) => [e.empleadoId, { ...e, categorias: {}, alertas: [] }]),
    );
    for (const c of porCategoria) {
      const f = filas.get(c.empleadoId);
      if (f) f.categorias[c.categoria] = { minutos: c.minutos, valor: Math.round(c.valor * 100) / 100 };
    }
    // Límite semanal de 12 horas extra
    const semanas = new Map<string, number>();
    for (const d of porSemana) {
      const k = `${d.empleadoId}|${lunesDeSemana(d.fecha)}`;
      semanas.set(k, (semanas.get(k) ?? 0) + d.minutosExtra);
    }
    for (const [k, min] of semanas) {
      if (min <= MAX_EXTRA_SEMANA_MIN) continue;
      const [emp, lunes] = k.split("|");
      filas.get(Number(emp))?.alertas.push(`Semana del ${lunes}: ${formatearMinutos(min)} h extra (máx. 12 h).`);
    }

    const datos = [...filas.values()];
    const totales = {
      empleados: datos.length,
      turnos: datos.reduce((s, f) => s + f.turnos, 0),
      minutosTotales: datos.reduce((s, f) => s + f.minutosTotales, 0),
      minutosExtra: datos.reduce((s, f) => s + f.minutosExtra, 0),
      minutosExtraPendientes: datos.reduce((s, f) => s + f.minutosExtraPendientes, 0),
      valorTotal: Math.round(datos.reduce((s, f) => s + f.valorTotal, 0) * 100) / 100,
      categorias: Object.fromEntries(
        CATEGORIAS.map((c) => [
          c,
          {
            minutos: datos.reduce((s, f) => s + (f.categorias[c]?.minutos ?? 0), 0),
            valor: Math.round(datos.reduce((s, f) => s + (f.categorias[c]?.valor ?? 0), 0) * 100) / 100,
          },
        ]),
      ),
    };

    if (formato === "csv") {
      const encabezado = [
        "Identificación",
        "Empleado",
        "Cargo",
        "Salario",
        "Turnos",
        "Horas trabajadas",
        "Horas extra liquidadas",
        "Horas extra pendientes de aprobación",
        ...CATEGORIAS.flatMap((c) => [`${ETIQUETAS[c].corta} horas`, `${ETIQUETAS[c].corta} valor`]),
        "Total a pagar (recargos y extras)",
        "Alertas",
      ];
      const cuerpo = datos.map((f) => [
        f.identificacion,
        f.nombre,
        f.cargo,
        pesos(f.salario),
        f.turnos,
        horas(f.minutosTotales),
        horas(f.minutosExtra),
        horas(f.minutosExtraPendientes),
        ...CATEGORIAS.flatMap((c) => [horas(f.categorias[c]?.minutos ?? 0), pesos(f.categorias[c]?.valor ?? 0)]),
        pesos(f.valorTotal),
        f.alertas.join(" | "),
      ]);
      // Con filtro de empleado, el archivo lleva su identificación para no confundirlo con el general.
      const sufijo = empleadoId && datos[0] ? `_${datos[0].identificacion.replace(/[^\w-]/g, "")}` : "";
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="liquidacion${sufijo}_${desde}_${hasta}.csv"`);
      return aCsv([encabezado, ...cuerpo]);
    }
    return { desde, hasta, datos, totales };
  });

  r.get("/marcaciones", { onRequest: requiereSesion(), schema: { querystring: rango.omit({ formato: true }) } }, async (req, reply) => {
    const { desde, hasta, empleadoId } = req.query;
    const filas = await db
      .select({
        id: marcaciones.id,
        identificacion: empleados.identificacion,
        empleado: sql<string>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
        entrada: sql<string>`to_char(${marcaciones.entrada} at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')`,
        salida: sql<string | null>`to_char(${marcaciones.salida} at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')`,
        estado: marcaciones.estado,
        origen: marcaciones.origen,
        minutosTotales: marcaciones.minutosTotales,
        minutosExtra: marcaciones.minutosExtra,
        valorRecargos: marcaciones.valorRecargos,
        observacion: marcaciones.observacion,
      })
      .from(marcaciones)
      .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
      .where(
        and(
          gte(marcaciones.entrada, desdeLocal(desde)),
          lt(marcaciones.entrada, desdeLocal(sumarDias(hasta, 1))),
          empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
        ),
      )
      .orderBy(asc(marcaciones.entrada));
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="marcaciones_${desde}_${hasta}.csv"`);
    return aCsv([
      ["ID", "Identificación", "Empleado", "Entrada", "Salida", "Estado", "Origen", "Horas", "Horas extra", "Recargos", "Observación"],
      ...filas.map((f) => [
        f.id,
        f.identificacion,
        f.empleado,
        f.entrada,
        f.salida,
        f.estado,
        f.origen,
        f.minutosTotales == null ? "" : horas(f.minutosTotales),
        f.minutosExtra == null ? "" : horas(f.minutosExtra),
        f.valorRecargos == null ? "" : pesos(f.valorRecargos),
        f.observacion,
      ]),
    ]);
  });
};
