import { esZonaValida, establecerZona, ZONA_PREDETERMINADA, zonaHoraria } from "@inout/core";
import { eq, sql } from "drizzle-orm";
import type { DbTx } from "../db/client.js";
import { ajustes } from "../db/schema.js";

export const CLAVE_ZONA = "zona_horaria";

/**
 * Ajustes generales de la instalación. La zona horaria rige el kiosko, el panel y la
 * liquidación (día, franja nocturna, festivos); se aplica a todo el proceso con establecerZona.
 */
export class ServicioAjustes {
  /** Lee la zona guardada y la aplica. Si no hay ninguna (o no es válida) usa la de Colombia. */
  async cargar(db: DbTx): Promise<void> {
    const [fila] = await db.select().from(ajustes).where(eq(ajustes.clave, CLAVE_ZONA));
    const zona = typeof fila?.valor === "string" && esZonaValida(fila.valor) ? fila.valor : ZONA_PREDETERMINADA;
    establecerZona(zona);
  }

  zona(): string {
    return zonaHoraria();
  }

  /** Guarda la zona dentro de la transacción. Se aplica con aplicarZona cuando la transacción confirma. */
  async guardarZona(tx: DbTx, zona: string): Promise<void> {
    await tx
      .insert(ajustes)
      .values({ clave: CLAVE_ZONA, valor: zona })
      .onConflictDoUpdate({ target: ajustes.clave, set: { valor: zona, actualizadoEn: sql`now()` } });
  }

  aplicarZona(zona: string): void {
    establecerZona(zona);
  }
}
