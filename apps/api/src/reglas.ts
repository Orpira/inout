/**
 * Reglas de validación de marcaciones creadas o corregidas a mano.
 * Funciones puras (sin BD) para poder probarlas aisladas.
 */
export const MAX_DURACION_MANUAL_H = 24;
const MS_MIN = 60_000;

export interface Tramo {
  id?: number;
  entrada: Date;
  salida: Date | null;
}

/** Fin efectivo de un tramo: sin salida se considera un instante (1 minuto). */
function fin(t: Tramo): number {
  return t.salida ? t.salida.getTime() : t.entrada.getTime() + MS_MIN;
}

export function seSolapan(a: Tramo, b: Tramo): boolean {
  return a.entrada.getTime() < fin(b) && b.entrada.getTime() < fin(a);
}

/** Devuelve el mensaje de error o null si el tramo es válido. */
export function validarTramo(t: Tramo, otros: Tramo[], ahora = new Date()): string | null {
  if (t.entrada > ahora) return 'La entrada no puede estar en el futuro';
  if (t.salida) {
    if (t.salida <= t.entrada) return 'La salida debe ser posterior a la entrada';
    if (t.salida > ahora) return 'La salida no puede estar en el futuro';
    if (t.salida.getTime() - t.entrada.getTime() > MAX_DURACION_MANUAL_H * 3_600_000) {
      return `Un turno no puede durar más de ${MAX_DURACION_MANUAL_H} h`;
    }
  }
  const choque = otros.find((o) => o.id !== t.id && seSolapan(t, o));
  if (choque) return `Se cruza con otra marcación del empleado (n.º ${choque.id})`;
  return null;
}
