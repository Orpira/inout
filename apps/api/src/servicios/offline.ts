import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { marcasOffline } from "../db/schema.js";
import { ErrorHttp } from "../errores.js";
import type { ServicioMarcaciones } from "./marcaciones.js";

export interface MarcaOfflineEntrada {
  /** UUID generado por el dispositivo al capturar la marca. */
  id: string;
  codigo: string;
  /** Hora de captura según el reloj del dispositivo. */
  capturadoEn: Date;
  /** Entrada o salida elegida por el empleado en el kiosko (si se le preguntó). */
  tipo?: "ENTRADA" | "SALIDA";
}

export interface ResultadoSincronizacion {
  id: string;
  estado: "APLICADA" | "RECHAZADA" | "RESUELTA";
  tipo: string | null;
  mensaje: string | null;
}

/** Diferencias de reloj menores a esto se consideran latencia de red y no se corrigen. */
const UMBRAL_DESFASE_MS = 30_000;

/**
 * Aplica en orden cronológico las marcaciones que el kiosko capturó sin conexión.
 * - Idempotente: una marca ya recibida (mismo id) devuelve el resultado guardado.
 * - Corrige el reloj del dispositivo con la diferencia entre su hora de envío y la del servidor.
 * - Las que no se pueden aplicar quedan como RECHAZADA para que un supervisor las resuelva;
 *   los duplicados evidentes se descartan solos (RESUELTA).
 */
export class ServicioOffline {
  constructor(
    private readonly db: Db,
    private readonly marcaciones: ServicioMarcaciones,
  ) {}

  async sincronizar(marcas: MarcaOfflineEntrada[], enviadoEn: Date, dispositivo: string | null): Promise<ResultadoSincronizacion[]> {
    const desfaseMs = Date.now() - enviadoEn.getTime();
    const correccion = Math.abs(desfaseMs) > UMBRAL_DESFASE_MS ? desfaseMs : 0;

    const previas = marcas.length
      ? await this.db.select().from(marcasOffline).where(inArray(marcasOffline.id, marcas.map((m) => m.id)))
      : [];
    const yaRecibidas = new Map(previas.map((p) => [p.id, p]));

    const ordenadas = [...marcas].sort((a, b) => a.capturadoEn.getTime() - b.capturadoEn.getTime());
    const resultados = new Map<string, ResultadoSincronizacion>();

    for (const m of ordenadas) {
      const previa = yaRecibidas.get(m.id);
      if (previa) {
        resultados.set(m.id, { id: m.id, estado: previa.estado, tipo: previa.tipo, mensaje: previa.mensaje });
        continue;
      }
      const momento = new Date(m.capturadoEn.getTime() + correccion);
      const base = {
        id: m.id,
        codigo: m.codigo.trim(),
        capturadoEn: momento,
        capturadoDispositivo: m.capturadoEn,
        desfaseSegundos: Math.round(correccion / 1000),
        dispositivo,
      };
      try {
        const r = await this.marcaciones.marcar(m.codigo, { momento, offline: true, tipo: m.tipo });
        const fila = {
          ...base,
          estado: "APLICADA" as const,
          tipo: r.tipo,
          mensaje: r.aviso ?? null,
          empleadoId: r.empleado.id,
          marcacionId: r.marcacion.id,
        };
        await this.db.insert(marcasOffline).values(fila).onConflictDoNothing();
        resultados.set(m.id, { id: m.id, estado: fila.estado, tipo: fila.tipo, mensaje: fila.mensaje });
      } catch (e) {
        if (!(e instanceof ErrorHttp) || e.status >= 500) throw e;
        const duplicada = e.codigo === "MARCA_DUPLICADA";
        const fila = {
          ...base,
          estado: duplicada ? ("RESUELTA" as const) : ("RECHAZADA" as const),
          tipo: null,
          mensaje: e.message,
          notaResolucion: duplicada ? "Descartada automáticamente: marcación repetida." : null,
          resueltaEn: duplicada ? new Date() : null,
        };
        await this.db.insert(marcasOffline).values(fila).onConflictDoNothing();
        resultados.set(m.id, { id: m.id, estado: fila.estado, tipo: null, mensaje: fila.mensaje });
      }
    }
    return marcas.map((m) => resultados.get(m.id)!);
  }

  async resolver(usuarioId: number, id: string, nota: string) {
    const [r] = await this.db
      .update(marcasOffline)
      .set({ estado: "RESUELTA", resueltaPor: usuarioId, resueltaEn: new Date(), notaResolucion: nota })
      .where(eq(marcasOffline.id, id))
      .returning();
    if (!r) throw new ErrorHttp(404, "Marca no encontrada", "NO_ENCONTRADO");
    return r;
  }
}
