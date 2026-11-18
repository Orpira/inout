import { CATEGORIAS, ETIQUETAS, desdeLocal, formatearMinutos, lunesDeSemana, MAX_EXTRA_SEMANA_MIN, sumarDias, type Categoria } from "@inout/core";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { empleados, liquidacionLineas, marcaciones, sucursales } from "../db/schema.js";
import { conflicto, solicitudInvalida } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { estadoDelRango, pendientesDelRango, periodosVigentes } from "../servicios/periodos.js";
import { nombreEmpresa } from "./empresa.js";
import { fechaISO } from "./marcaciones.js";
import { libroExtrasDiarias, type FilaExtrasDiarias } from "../servicios/excel.js";

const rango = z.object({
  desde: fechaISO,
  hasta: fechaISO,
  empleadoId: z.coerce.number().int().optional(),
  /** Solo la parte de un centro de costo (la liquidación sigue siendo una sola). */
  sucursalId: z.coerce.number().int().optional(),
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
  /** Turnos del periodo sin resolver (sin salida o por corregir): no están incluidos en los valores. */
  turnosPorRevisar: number;
  /** Turnos del periodo que siguen abiertos. */
  turnosEnCurso: number;
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
  alertas: string[];
  /** Desglose por centro de costo (sucursal donde se trabajó). */
  centros: CentroCosto[];
}

interface CentroCosto {
  sucursalId: number | null;
  codigo: string | null;
  nombre: string;
  turnos: number;
  minutosTotales: number;
  minutosExtra: number;
  valorTotal: number;
  categorias: Partial<Record<Categoria, { minutos: number; valor: number }>>;
}

const SIN_CENTRO = "Sin centro de costo";
const redondear = (v: number) => Math.round(v * 100) / 100;

const csvCelda = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const aCsv = (filas: unknown[][]) => "﻿" + filas.map((f) => f.map(csvCelda).join(";")).join("\r\n");
const horas = (min: number) => (min / 60).toFixed(2).replace(".", ",");
const pesos = (v: number) => v.toFixed(2).replace(".", ",");

export const rutasReportes: Rutas = (app, { db, env }) => {
  const r = zapp(app);

  r.get("/liquidacion", { onRequest: requiereSesion(), schema: { querystring: rango } }, async (req, reply) => {
    const { desde, hasta, empleadoId, sucursalId, formato } = req.query;
    if (hasta < desde) throw solicitudInvalida("El rango de fechas es inválido.");
    const ini = desdeLocal(desde);
    const fin = desdeLocal(sumarDias(hasta, 1));
    const filtroMarc = and(
      eq(marcaciones.estado, "CERRADA"),
      gte(marcaciones.entrada, ini),
      lt(marcaciones.entrada, fin),
      empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
      sucursalId ? eq(marcaciones.sucursalId, sucursalId) : undefined,
    );

    const [liquidados, pendientes] = await Promise.all([periodosVigentes(db, desde, hasta), pendientesDelRango(db, desde, hasta, empleadoId)]);
    const estado = estadoDelRango(desde, hasta, liquidados);
    if (formato === "csv" && estado === "MIXTO") {
      throw conflicto("El rango mezcla días ya liquidados con días sin liquidar. Ajusta las fechas para no pagar dos veces.", "PERIODO_MIXTO");
    }

    const [porCategoria, porEmpleado, porSemana, porCentro, porCentroCategoria] = await Promise.all([
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
          orden: sql<string>`lower(${empleados.apellido} || ' ' || ${empleados.nombre})`,
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
      db
        .select({
          empleadoId: marcaciones.empleadoId,
          sucursalId: marcaciones.sucursalId,
          codigo: sucursales.codigo,
          nombre: sucursales.nombre,
          turnos: sql<number>`count(*)::int`,
          minutosTotales: sql<number>`coalesce(sum(${marcaciones.minutosTotales}),0)::int`,
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
          valorTotal: sql<number>`coalesce(sum(${marcaciones.valorRecargos}),0)::float8`,
        })
        .from(marcaciones)
        .leftJoin(sucursales, eq(sucursales.id, marcaciones.sucursalId))
        .where(filtroMarc)
        .groupBy(marcaciones.empleadoId, marcaciones.sucursalId, sucursales.codigo, sucursales.nombre),
      db
        .select({
          empleadoId: marcaciones.empleadoId,
          sucursalId: marcaciones.sucursalId,
          categoria: liquidacionLineas.categoria,
          minutos: sql<number>`sum(${liquidacionLineas.minutos})::int`,
          valor: sql<number>`sum(${liquidacionLineas.valor})::float8`,
        })
        .from(liquidacionLineas)
        .innerJoin(marcaciones, eq(marcaciones.id, liquidacionLineas.marcacionId))
        .where(filtroMarc)
        .groupBy(marcaciones.empleadoId, marcaciones.sucursalId, liquidacionLineas.categoria),
    ]);

    const filas = new Map<number, FilaReporte & { orden: string }>(
      porEmpleado.map((e) => [e.empleadoId, { ...e, turnosPorRevisar: 0, turnosEnCurso: 0, categorias: {}, alertas: [], centros: [] }]),
    );
    // Quien solo tiene turnos sin resolver también aparece (en ceros), para que nómina no lo pase por alto.
    for (const p of pendientes.porEmpleado) {
      if (!p.porRevisar && !p.enTurno) continue;
      const f =
        filas.get(p.empleadoId) ??
        filas
          .set(p.empleadoId, {
            empleadoId: p.empleadoId,
            identificacion: p.identificacion,
            nombre: `${p.nombre} ${p.apellido}`,
            orden: `${p.apellido} ${p.nombre}`.toLowerCase(),
            cargo: p.cargo,
            salario: p.salario,
            turnos: 0,
            minutosTotales: 0,
            minutosExtra: 0,
            minutosExtraPendientes: 0,
            turnosPorRevisar: 0,
            turnosEnCurso: 0,
            valorTotal: 0,
            categorias: {},
            alertas: [],
            centros: [],
          })
          .get(p.empleadoId)!;
      f.turnosPorRevisar = p.porRevisar;
      f.turnosEnCurso = p.enTurno;
    }
    for (const c of porCategoria) {
      const f = filas.get(c.empleadoId);
      if (f) f.categorias[c.categoria] = { minutos: c.minutos, valor: Math.round(c.valor * 100) / 100 };
    }
    // Desglose por centro de costo: una sola liquidación, con las horas imputadas a la sucursal donde se trabajó.
    const clave = (emp: number, suc: number | null) => `${emp}|${suc ?? ""}`;
    const centros = new Map<string, CentroCosto>();
    for (const c of porCentro) {
      const centro: CentroCosto = {
        sucursalId: c.sucursalId,
        codigo: c.codigo,
        nombre: c.nombre ?? SIN_CENTRO,
        turnos: c.turnos,
        minutosTotales: c.minutosTotales,
        minutosExtra: c.minutosExtra,
        valorTotal: redondear(c.valorTotal),
        categorias: {},
      };
      centros.set(clave(c.empleadoId, c.sucursalId), centro);
      filas.get(c.empleadoId)?.centros.push(centro);
    }
    for (const c of porCentroCategoria) {
      const centro = centros.get(clave(c.empleadoId, c.sucursalId));
      if (centro) centro.categorias[c.categoria] = { minutos: c.minutos, valor: redondear(c.valor) };
    }
    for (const f of filas.values()) f.centros.sort((a, b) => (a.sucursalId === null ? 1 : b.sucursalId === null ? -1 : a.nombre.localeCompare(b.nombre, "es")));
    const subtotales = new Map<number | null, CentroCosto>();
    for (const c of centros.values()) {
      const t =
        subtotales.get(c.sucursalId) ??
        subtotales
          .set(c.sucursalId, { sucursalId: c.sucursalId, codigo: c.codigo, nombre: c.nombre, turnos: 0, minutosTotales: 0, minutosExtra: 0, valorTotal: 0, categorias: {} })
          .get(c.sucursalId)!;
      t.turnos += c.turnos;
      t.minutosTotales += c.minutosTotales;
      t.minutosExtra += c.minutosExtra;
      t.valorTotal = redondear(t.valorTotal + c.valorTotal);
      for (const [cat, v] of Object.entries(c.categorias) as [Categoria, { minutos: number; valor: number }][]) {
        const a = (t.categorias[cat] ??= { minutos: 0, valor: 0 });
        a.minutos += v.minutos;
        a.valor = redondear(a.valor + v.valor);
      }
    }
    const porCentroCosto = [...subtotales.values()].sort((a, b) => (a.sucursalId === null ? 1 : b.sucursalId === null ? -1 : a.nombre.localeCompare(b.nombre, "es")));

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

    const datos: FilaReporte[] = [...filas.values()].sort((a, b) => a.orden.localeCompare(b.orden, "es")).map(({ orden: _orden, ...f }) => f);
    const cierre = {
      estado,
      periodos: liquidados.map((p) => ({ id: p.id, desde: p.desde, hasta: p.hasta, cerradoEn: p.cerradoEn, nota: p.nota })),
    };
    const { porEmpleado: _porEmpleado, ...resumenPendientes } = pendientes;
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
      // Una fila por empleado y centro de costo: nómina imputa cada valor a la sucursal donde se trabajó.
      // Lo que no depende del centro (pendientes, turnos por revisar, alertas) va solo en la primera fila del empleado.
      const encabezado = [
        "Código centro de costo",
        "Centro de costo",
        "Identificación",
        "Empleado",
        "Cargo",
        "Salario",
        "Turnos",
        "Horas trabajadas",
        "Horas extra liquidadas",
        "Horas extra pendientes de aprobación",
        "Turnos por revisar (no incluidos)",
        ...CATEGORIAS.flatMap((c) => [`${ETIQUETAS[c].corta} horas`, `${ETIQUETAS[c].corta} valor`]),
        "Total a pagar (recargos y extras)",
        "Alertas",
        "Estado del periodo",
      ];
      const textoEstado = estado === "LIQUIDADO" ? "Liquidado" : "Sin cerrar";
      const vacio: CentroCosto = { sucursalId: null, codigo: null, nombre: SIN_CENTRO, turnos: 0, minutosTotales: 0, minutosExtra: 0, valorTotal: 0, categorias: {} };
      const cuerpo = datos.flatMap((f) =>
        (f.centros.length ? f.centros : [vacio]).map((c, i) => [
          c.codigo,
          c.nombre,
          f.identificacion,
          f.nombre,
          f.cargo,
          pesos(f.salario),
          c.turnos,
          horas(c.minutosTotales),
          horas(c.minutosExtra),
          i === 0 ? horas(f.minutosExtraPendientes) : "",
          i === 0 ? f.turnosPorRevisar + f.turnosEnCurso : "",
          ...CATEGORIAS.flatMap((cat) => [horas(c.categorias[cat]?.minutos ?? 0), pesos(c.categorias[cat]?.valor ?? 0)]),
          pesos(c.valorTotal),
          i === 0 ? f.alertas.join(" | ") : "",
          textoEstado,
        ]),
      );
      // Con filtro de empleado, el archivo lleva su identificación para no confundirlo con el general.
      const sufijo =
        (empleadoId && datos[0] ? `_${datos[0].identificacion.replace(/[^\w-]/g, "")}` : "") +
        (sucursalId && porCentroCosto[0]?.codigo ? `_cc-${porCentroCosto[0].codigo.replace(/[^\w-]/g, "")}` : "");
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="liquidacion${sufijo}_${desde}_${hasta}.csv"`);
      return aCsv([encabezado, ...cuerpo]);
    }
    return { desde, hasta, datos, totales, porCentroCosto, pendientes: resumenPendientes, cierre };
  });

  /**
   * Detalle por día de las horas extra de cada empleado (formato del reporte mensual de nómina):
   * fecha, empleado, cédula, ingreso, salida y horas extra diurnas, nocturnas y dominicales/festivas.
   * Solo cuenta las extras reconocidas; las pendientes van en su propia columna y no se suman.
   */
  r.get(
    "/extras-diarias",
    { onRequest: requiereSesion(), schema: { querystring: rango.extend({ formato: z.enum(["json", "xlsx"]).default("json") }) } },
    async (req, reply) => {
      const { desde, hasta, empleadoId, sucursalId, formato } = req.query;
      if (hasta < desde) throw solicitudInvalida("El rango de fechas es inválido.");
      const minCat = (cats: Categoria[]) =>
        sql<number>`coalesce(sum(${liquidacionLineas.minutos}) filter (where ${liquidacionLineas.categoria} in (${sql.join(
          cats.map((c) => sql`${c}`),
          sql`, `,
        )})),0)::int`;
      const filas = await db
        .select({
          marcacionId: marcaciones.id,
          empleadoId: empleados.id,
          fecha: sql<string>`to_char(${marcaciones.entrada} at time zone 'America/Bogota', 'YYYY-MM-DD')`,
          empleado: sql<string>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
          identificacion: empleados.identificacion,
          entrada: sql<string>`to_char(${marcaciones.entrada} at time zone 'America/Bogota', 'HH24:MI')`,
          salida: sql<string | null>`to_char(${marcaciones.salida} at time zone 'America/Bogota', 'HH24:MI')`,
          salidaAutomatica: marcaciones.salidaAutomatica,
          codigoCentro: sucursales.codigo,
          centro: sucursales.nombre,
          minDiurnas: minCat(["EXT_DIURNA"]),
          minNocturnas: minCat(["EXT_NOCTURNA"]),
          minFestivas: minCat(["EXT_DIURNA_DF", "EXT_NOCTURNA_DF"]),
          minPendientes: sql<number>`(case when ${marcaciones.estadoExtras} = 'PENDIENTE' then coalesce(${marcaciones.minutosExtraCalculados},0) else 0 end)::int`,
        })
        .from(marcaciones)
        .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
        .leftJoin(liquidacionLineas, eq(liquidacionLineas.marcacionId, marcaciones.id))
        .leftJoin(sucursales, eq(sucursales.id, marcaciones.sucursalId))
        .where(
          and(
            eq(marcaciones.estado, "CERRADA"),
            gte(marcaciones.entrada, desdeLocal(desde)),
            lt(marcaciones.entrada, desdeLocal(sumarDias(hasta, 1))),
            empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
            sucursalId ? eq(marcaciones.sucursalId, sucursalId) : undefined,
          ),
        )
        .groupBy(marcaciones.id, empleados.id, sucursales.id)
        .orderBy(asc(sql`lower(${empleados.nombre} || ' ' || ${empleados.apellido})`), asc(marcaciones.entrada));

      const datos: FilaExtrasDiarias[] = filas.filter((f) => f.minDiurnas + f.minNocturnas + f.minFestivas + f.minPendientes > 0);
      const totales = {
        empleados: new Set(datos.map((f) => f.empleadoId)).size,
        dias: datos.length,
        minDiurnas: datos.reduce((s, f) => s + f.minDiurnas, 0),
        minNocturnas: datos.reduce((s, f) => s + f.minNocturnas, 0),
        minFestivas: datos.reduce((s, f) => s + f.minFestivas, 0),
        minPendientes: datos.reduce((s, f) => s + f.minPendientes, 0),
      };

      if (formato === "xlsx") {
        const libro = libroExtrasDiarias({ desde, hasta, empresa: await nombreEmpresa(db, env.EMPRESA_NOMBRE), filas: datos });
        const sufijo =
          (empleadoId && datos[0] ? `_${datos[0].identificacion.replace(/[^\w-]/g, "")}` : "") +
          (sucursalId && datos[0]?.codigoCentro ? `_cc-${datos[0].codigoCentro.replace(/[^\w-]/g, "")}` : "");
        reply
          .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
          .header("Content-Disposition", `attachment; filename="horas-extra-diarias${sufijo}_${desde}_${hasta}.xlsx"`);
        return reply.send(Buffer.from(await libro.xlsx.writeBuffer()));
      }
      return { desde, hasta, datos, totales };
    },
  );

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
