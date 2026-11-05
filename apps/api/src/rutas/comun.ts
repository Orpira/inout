import { type FechaLocal, desdeLocal, fechaLocal, horaLocal } from '@inout/core';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { auditoria } from '../db/schema.js';

export class ErrorHttp extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export function validar<T>(esquema: z.ZodType<T>, valor: unknown): T {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
    throw new ErrorHttp(400, detalle.join('; '));
  }
  return r.data;
}

export const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD');
export const zHora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:mm');
export const zMotivo = z.string().trim().min(5, 'el motivo debe tener al menos 5 caracteres').max(500);
export const zId = z.object({ id: z.coerce.number().int().positive() });

/**
 * Momento expresado en hora de Colombia, tal como lo escribe el supervisor.
 * El navegador envía texto (fecha + hora) y la conversión a instante la hace
 * el servidor: así la zona del equipo del supervisor no influye.
 */
export const zMomento = z.object({ fecha: zFecha, hora: zHora }).transform((m) => desdeLocal(m.fecha, m.hora));

/** Instante → representación para la API (ISO + campos en hora de Colombia). */
export function momento(d: Date | null) {
  return d ? { iso: d.toISOString(), fecha: fechaLocal(d), hora: horaLocal(d) } : null;
}

/** Rango de fechas civiles [desde, hasta] (ambos inclusive) con un máximo de días. */
export function zRango(maxDias: number) {
  return z
    .object({ desde: zFecha, hasta: zFecha })
    .refine((r) => r.desde <= r.hasta, 'desde debe ser anterior o igual a hasta')
    .refine(
      (r) => (desdeLocal(r.hasta).getTime() - desdeLocal(r.desde).getTime()) / 86_400_000 < maxDias,
      `el rango no puede superar ${maxDias} días`,
    );
}

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function auditar(
  tx: Tx | Db,
  datos: { tabla: string; registroId: string | number; usuarioId: number | null; motivo: string; antes: unknown; despues: unknown },
) {
  await tx.insert(auditoria).values({ ...datos, registroId: String(datos.registroId) });
}

export type { FechaLocal };
