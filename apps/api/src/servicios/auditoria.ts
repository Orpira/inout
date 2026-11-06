import { z } from "zod";
import type { DbTx } from "../db/client.js";
import { auditoria } from "../db/schema.js";

export const motivoObligatorio = z.string().trim().min(5, "Explica el motivo (mínimo 5 caracteres)").max(500);

export type EntidadAuditada = "marcacion" | "empleado" | "horario" | "festivo";

/** Las fechas de festivos se auditan con un id numérico AAAAMMDD. */
export const idFecha = (fecha: string) => Number(fecha.replace(/-/g, ""));

/** JSON con claves ordenadas: PostgreSQL (jsonb) no conserva el orden de las claves. */
function estable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
}

/** Solo los campos que cambiaron, para que el historial sea legible. */
export function diferencias<T extends Record<string, unknown>>(antes: T, despues: Partial<T>) {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const k of Object.keys(despues)) {
    if (["actualizadoEn", "creadoEn"].includes(k)) continue;
    if (estable(antes[k]) !== estable(despues[k])) {
      a[k] = antes[k];
      d[k] = despues[k];
    }
  }
  return { antes: a, despues: d, hayCambios: Object.keys(d).length > 0 };
}

export async function auditar(
  tx: DbTx,
  datos: { entidad: EntidadAuditada; entidadId: number; usuarioId: number | null; accion: string; motivo: string | null; antes: unknown; despues: unknown },
) {
  await tx.insert(auditoria).values(datos);
}
