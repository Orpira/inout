import { desdeLocal, fechaLocal, parametrosVigentes, sumarDias } from "@inout/core";
import { and, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { empleados, marcaciones, marcasOffline } from "../db/schema.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { columnasMarcacion } from "./marcaciones.js";
import { zonaSql } from "../db/zona.js";

export const rutasDashboard: Rutas = (app, { db, calendario }) => {
  const r = zapp(app);

  r.get("/", { onRequest: requiereSesion() }, async () => {
    const hoy = fechaLocal(new Date());
    const inicioHoy = desdeLocal(hoy);
    const inicioMes = desdeLocal(`${hoy.slice(0, 7)}-01`);
    const inicioSerie = desdeLocal(sumarDias(hoy, -13));
    const cal = await calendario.obtener(db);

    const [presentes, [hoyStats], [revision], [mes], serie, top, ultimas, [activos]] = await Promise.all([
      db
        .select(columnasMarcacion)
        .from(marcaciones)
        .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
        .where(eq(marcaciones.estado, "ABIERTA"))
        .orderBy(marcaciones.entrada),
      db
        .select({ entradas: count(), empleados: sql<number>`count(distinct ${marcaciones.empleadoId})::int` })
        .from(marcaciones)
        .where(and(gte(marcaciones.entrada, inicioHoy), ne(marcaciones.estado, "ANULADA"))),
      db.select({ n: count() }).from(marcaciones).where(eq(marcaciones.estado, "REVISION")),
      db
        .select({
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
          valor: sql<number>`coalesce(sum(${marcaciones.valorRecargos}),0)::float8`,
          turnos: count(),
        })
        .from(marcaciones)
        .where(and(eq(marcaciones.estado, "CERRADA"), gte(marcaciones.entrada, inicioMes))),
      db
        .select({
          fecha: sql<string>`to_char(${marcaciones.entrada} at time zone ${zonaSql()}, 'YYYY-MM-DD')`,
          minutosTotales: sql<number>`coalesce(sum(${marcaciones.minutosTotales}),0)::int`,
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
        })
        .from(marcaciones)
        .where(and(eq(marcaciones.estado, "CERRADA"), gte(marcaciones.entrada, inicioSerie)))
        .groupBy(sql`1`),
      db
        .select({
          empleadoId: empleados.id,
          nombre: sql<string>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
          minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
          valor: sql<number>`coalesce(sum(${marcaciones.valorRecargos}),0)::float8`,
        })
        .from(marcaciones)
        .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
        .where(and(eq(marcaciones.estado, "CERRADA"), gte(marcaciones.entrada, inicioMes)))
        .groupBy(empleados.id)
        .orderBy(desc(sql`3`))
        .limit(5),
      db
        .select(columnasMarcacion)
        .from(marcaciones)
        .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
        .where(ne(marcaciones.estado, "ANULADA"))
        .orderBy(desc(sql`coalesce(${marcaciones.salida}, ${marcaciones.entrada})`))
        .limit(8),
      db.select({ n: count() }).from(empleados).where(eq(empleados.activo, true)),
    ]);
    const [[pendientes], [offline]] = await Promise.all([
      db
        .select({ n: count(), minutos: sql<number>`coalesce(sum(${marcaciones.minutosExtraCalculados}),0)::int` })
        .from(marcaciones)
        .where(and(eq(marcaciones.estado, "CERRADA"), eq(marcaciones.estadoExtras, "PENDIENTE"))),
      db.select({ n: count() }).from(marcasOffline).where(eq(marcasOffline.estado, "RECHAZADA")),
    ]);

    const porFecha = new Map(serie.map((s) => [s.fecha, s]));
    const dias = Array.from({ length: 14 }, (_, i) => {
      const f = sumarDias(hoy, i - 13);
      const s = porFecha.get(f);
      return { fecha: f, minutosTotales: s?.minutosTotales ?? 0, minutosExtra: s?.minutosExtra ?? 0, festivo: cal.nombre(f) ?? null };
    });

    const proximos = [] as { fecha: string; nombre: string }[];
    for (let i = 0; i < 60 && proximos.length < 3; i++) {
      const f = sumarDias(hoy, i);
      const n = cal.nombre(f);
      if (n) proximos.push({ fecha: f, nombre: n });
    }

    return {
      hoy,
      esFestivoHoy: cal.nombre(hoy) ?? null,
      empleadosActivos: activos?.n ?? 0,
      presentes,
      entradasHoy: hoyStats?.entradas ?? 0,
      empleadosHoy: hoyStats?.empleados ?? 0,
      enRevision: revision?.n ?? 0,
      extrasPendientes: { marcaciones: pendientes?.n ?? 0, minutos: pendientes?.minutos ?? 0 },
      offlineRechazadas: offline?.n ?? 0,
      mes: { minutosExtra: mes?.minutosExtra ?? 0, valor: mes?.valor ?? 0, turnos: mes?.turnos ?? 0 },
      serie: dias,
      topExtras: top,
      ultimas,
      proximosFestivos: proximos,
      parametros: parametrosVigentes(hoy),
    };
  });
};
