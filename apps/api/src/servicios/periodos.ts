import { fechaLocal, desdeLocal, sumarDias } from "@inout/core";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db, DbTx } from "../db/client.js";
import { empleados, marcaciones, marcasOffline, periodosLiquidados, usuarios, type DetallePeriodo, type PeriodoLiquidado, type ResumenPeriodo } from "../db/schema.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errores.js";
import { auditar } from "./auditoria.js";

const dma = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cierres vigentes (sin reabrir) que comparten algún día con el rango. */
export async function periodosVigentes(tx: DbTx, desde: string, hasta: string): Promise<PeriodoLiquidado[]> {
  return tx
    .select()
    .from(periodosLiquidados)
    .where(and(isNull(periodosLiquidados.reabiertoEn), lte(periodosLiquidados.desde, hasta), gte(periodosLiquidados.hasta, desde)))
    .orderBy(asc(periodosLiquidados.desde));
}

/**
 * Impide modificar marcaciones de un día que pertenece a un periodo liquidado.
 * Se llama desde todas las operaciones que crean, cambian o recalculan una marcación.
 */
export async function exigirPeriodoAbierto(tx: DbTx, ...fechas: string[]) {
  for (const fecha of new Set(fechas)) {
    const [p] = await periodosVigentes(tx, fecha, fecha);
    if (p) {
      throw conflicto(
        `El ${dma(fecha)} pertenece a un periodo ya liquidado (${dma(p.desde)} al ${dma(p.hasta)}) y es de solo consulta. Un administrador puede reabrirlo desde Liquidación.`,
        "PERIODO_LIQUIDADO",
      );
    }
  }
}

export type EstadoRango = "ABIERTO" | "LIQUIDADO" | "MIXTO";

/** Indica si los días del rango están todos liquidados, ninguno o solo una parte. */
export function estadoDelRango(desde: string, hasta: string, periodos: Pick<PeriodoLiquidado, "desde" | "hasta">[]): EstadoRango {
  if (!periodos.length) return "ABIERTO";
  // Los cierres vigentes no se solapan y llegan ordenados: basta recorrerlos buscando huecos.
  let cursor = desde;
  for (const p of periodos) {
    if (p.desde > cursor) return "MIXTO";
    if (p.hasta >= cursor) cursor = sumarDias(p.hasta, 1);
  }
  return cursor > hasta ? "LIQUIDADO" : "MIXTO";
}

export interface PendienteEmpleado {
  empleadoId: number;
  identificacion: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  salario: number;
  porRevisar: number;
  enTurno: number;
  extrasPorAprobar: number;
}

export interface PendientesPeriodo {
  /** Turnos sin salida o con datos por corregir: no entran en la liquidación. */
  porRevisar: number;
  /** Turnos todavía abiertos. */
  enTurno: number;
  /** Turnos cerrados con horas extra sin aprobar ni rechazar. */
  extrasPorAprobar: number;
  /** Marcaciones del kiosko sin conexión que no se pudieron aplicar. */
  offlineSinResolver: number;
  total: number;
  porEmpleado: PendienteEmpleado[];
}

/** Todo lo que falta por resolver en un rango antes de poder darlo por liquidado. */
export async function pendientesDelRango(tx: DbTx, desde: string, hasta: string, empleadoId?: number): Promise<PendientesPeriodo> {
  const ini = desdeLocal(desde);
  const fin = desdeLocal(sumarDias(hasta, 1));
  const [porEmpleado, [offline]] = await Promise.all([
    tx
      .select({
        empleadoId: empleados.id,
        identificacion: empleados.identificacion,
        nombre: empleados.nombre,
        apellido: empleados.apellido,
        cargo: empleados.cargo,
        salario: empleados.salario,
        porRevisar: sql<number>`count(*) filter (where ${marcaciones.estado} = 'REVISION')::int`,
        enTurno: sql<number>`count(*) filter (where ${marcaciones.estado} = 'ABIERTA')::int`,
        extrasPorAprobar: sql<number>`count(*) filter (where ${marcaciones.estado} = 'CERRADA' and ${marcaciones.estadoExtras} = 'PENDIENTE')::int`,
      })
      .from(marcaciones)
      .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
      .where(
        and(
          gte(marcaciones.entrada, ini),
          lt(marcaciones.entrada, fin),
          empleadoId ? eq(marcaciones.empleadoId, empleadoId) : undefined,
          sql`(${marcaciones.estado} in ('REVISION', 'ABIERTA') or (${marcaciones.estado} = 'CERRADA' and ${marcaciones.estadoExtras} = 'PENDIENTE'))`,
        ),
      )
      .groupBy(empleados.id)
      .orderBy(asc(empleados.apellido), asc(empleados.nombre)),
    tx
      .select({ n: count() })
      .from(marcasOffline)
      .where(
        and(
          eq(marcasOffline.estado, "RECHAZADA"),
          gte(marcasOffline.capturadoEn, ini),
          lt(marcasOffline.capturadoEn, fin),
          empleadoId ? eq(marcasOffline.empleadoId, empleadoId) : undefined,
        ),
      ),
  ]);
  const suma = (k: "porRevisar" | "enTurno" | "extrasPorAprobar") => porEmpleado.reduce((s, e) => s + e[k], 0);
  const r = { porRevisar: suma("porRevisar"), enTurno: suma("enTurno"), extrasPorAprobar: suma("extrasPorAprobar"), offlineSinResolver: offline?.n ?? 0 };
  return { ...r, total: r.porRevisar + r.enTurno + r.extrasPorAprobar + r.offlineSinResolver, porEmpleado };
}

export function describirPendientes(p: PendientesPeriodo): string {
  return [
    p.porRevisar ? plural(p.porRevisar, "turno por revisar", "turnos por revisar") : null,
    p.enTurno ? plural(p.enTurno, "turno sin cerrar", "turnos sin cerrar") : null,
    p.extrasPorAprobar ? plural(p.extrasPorAprobar, "turno con horas extra por aprobar", "turnos con horas extra por aprobar") : null,
    p.offlineSinResolver ? plural(p.offlineSinResolver, "marcación sin conexión por resolver", "marcaciones sin conexión por resolver") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export class ServicioPeriodos {
  constructor(private readonly db: Db) {}

  /** Historial de cierres, del más reciente al más antiguo, con quién cerró y quién reabrió. */
  async listar() {
    const filas = await this.db.select().from(periodosLiquidados).orderBy(desc(periodosLiquidados.desde), desc(periodosLiquidados.cerradoEn));
    const ids = [...new Set(filas.flatMap((f) => [f.cerradoPor, f.reabiertoPor]).filter((x): x is number => x != null))];
    const nombres = new Map(
      ids.length ? (await this.db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).where(inArray(usuarios.id, ids))).map((u) => [u.id, u.nombre]) : [],
    );
    return filas.map((f) => ({
      ...f,
      vigente: f.reabiertoEn === null,
      cerradoPorNombre: f.cerradoPor ? (nombres.get(f.cerradoPor) ?? null) : null,
      reabiertoPorNombre: f.reabiertoPor ? (nombres.get(f.reabiertoPor) ?? null) : null,
    }));
  }

  /**
   * Da un periodo por liquidado. Exige que haya terminado, que no comparta días con otro
   * cierre vigente y que no quede nada por resolver: así ningún turno se queda sin pagar.
   */
  async cerrar(usuarioId: number, datos: { desde: string; hasta: string; nota?: string | null }) {
    const { desde, hasta } = datos;
    if (hasta < desde) throw solicitudInvalida("El rango de fechas es inválido.");
    if (hasta >= fechaLocal(new Date())) {
      throw solicitudInvalida("Solo se puede cerrar un periodo que ya terminó: la fecha final debe ser anterior a hoy.");
    }
    try {
      return await this.db.transaction(async (tx) => {
        const solapados = await periodosVigentes(tx, desde, hasta);
        if (solapados.length) {
          throw conflicto(
            `El rango incluye días ya liquidados: ${solapados.map((p) => `${dma(p.desde)} al ${dma(p.hasta)}`).join("; ")}.`,
            "PERIODO_SOLAPADO",
          );
        }
        const pend = await pendientesDelRango(tx, desde, hasta);
        if (pend.total) {
          throw conflicto(`No se puede cerrar: quedan ${describirPendientes(pend)}. Resuélvelos primero para que no se queden sin liquidar.`, "PERIODO_CON_PENDIENTES");
        }
        const filas = await tx
          .select({
            empleadoId: empleados.id,
            identificacion: empleados.identificacion,
            nombre: sql<string>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
            turnos: sql<number>`count(*)::int`,
            minutosTotales: sql<number>`coalesce(sum(${marcaciones.minutosTotales}),0)::int`,
            minutosExtra: sql<number>`coalesce(sum(${marcaciones.minutosExtra}),0)::int`,
            valorTotal: sql<number>`coalesce(sum(${marcaciones.valorRecargos}),0)::float8`,
          })
          .from(marcaciones)
          .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
          .where(and(eq(marcaciones.estado, "CERRADA"), gte(marcaciones.entrada, desdeLocal(desde)), lt(marcaciones.entrada, desdeLocal(sumarDias(hasta, 1)))))
          .groupBy(empleados.id)
          .orderBy(asc(empleados.apellido), asc(empleados.nombre));
        const centavos = (v: number) => Math.round(v * 100) / 100;
        const detalle: DetallePeriodo[] = filas.map((f) => ({ ...f, valorTotal: centavos(f.valorTotal) }));
        const sumar = (k: "turnos" | "minutosTotales" | "minutosExtra" | "valorTotal") => detalle.reduce((s, f) => s + f[k], 0);
        const resumen: ResumenPeriodo = {
          empleados: detalle.length,
          turnos: sumar("turnos"),
          minutosTotales: sumar("minutosTotales"),
          minutosExtra: sumar("minutosExtra"),
          valorTotal: centavos(sumar("valorTotal")),
        };
        const [p] = await tx
          .insert(periodosLiquidados)
          .values({ desde, hasta, nota: datos.nota?.trim() || null, resumen, detalle, cerradoPor: usuarioId })
          .returning();
        await auditar(tx, { entidad: "periodo", entidadId: p!.id, usuarioId, accion: "CERRAR_PERIODO", motivo: p!.nota, antes: null, despues: { desde, hasta, resumen } });
        return p!;
      });
    } catch (e) {
      // Restricción de exclusión: otro cierre del mismo rango ganó la carrera.
      const pg = (e as { cause?: { code?: string }; code?: string }).cause ?? (e as { code?: string });
      if (pg?.code === "23P01") throw conflicto("El rango incluye días ya liquidados.", "PERIODO_SOLAPADO");
      throw e;
    }
  }

  /** Vuelve a permitir cambios en un periodo liquidado. Queda en el historial con su motivo. */
  async reabrir(usuarioId: number, id: number, motivo: string) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(periodosLiquidados).where(eq(periodosLiquidados.id, id));
      if (!p) throw noEncontrado("Periodo");
      if (p.reabiertoEn) throw conflicto("Este periodo ya fue reabierto.");
      const [r] = await tx
        .update(periodosLiquidados)
        .set({ reabiertoPor: usuarioId, reabiertoEn: new Date(), motivoReapertura: motivo })
        .where(eq(periodosLiquidados.id, id))
        .returning();
      await auditar(tx, { entidad: "periodo", entidadId: id, usuarioId, accion: "REABRIR_PERIODO", motivo, antes: { desde: p.desde, hasta: p.hasta, resumen: p.resumen }, despues: null });
      return r!;
    });
  }
}
