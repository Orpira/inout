import { crearCalendario, type CalendarioFestivos } from "@inout/core";
import type { DbTx } from "../db/client.js";
import { festivosAjustes } from "../db/schema.js";

/** Caché del calendario de festivos con los ajustes de la base de datos. */
export class ServicioCalendario {
  private cache: CalendarioFestivos | null = null;

  async obtener(db: DbTx): Promise<CalendarioFestivos> {
    if (!this.cache) {
      const ajustes = await db.select().from(festivosAjustes);
      this.cache = crearCalendario(ajustes);
    }
    return this.cache;
  }

  invalidar() {
    this.cache = null;
  }
}
