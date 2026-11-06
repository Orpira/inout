/**
 * Parámetros legales colombianos con vigencia por fecha.
 *
 * Fuentes:
 *  - Ley 2101 de 2021: reducción gradual de la jornada máxima semanal (48 → 42 h).
 *    El divisor mensual de la hora ordinaria = jornada semanal × 30 / 6.
 *  - Ley 2466 de 2025 (reforma laboral):
 *      art. 10 — jornada nocturna de 19:00 a 06:00 desde el 25-dic-2025 (antes 21:00).
 *      art. 14 — recargo dominical/festivo: 80 % (jul-2025), 90 % (jul-2026), 100 % (jul-2027).
 *  - CST art. 168: recargo nocturno 35 %, hora extra diurna 25 %, hora extra nocturna 75 %.
 *
 * Cada tabla está ordenada por fecha de inicio; se aplica el último tramo cuyo inicio ≤ fecha.
 */

interface Tramo<T> {
  desde: string; // YYYY-MM-DD inclusive
  valor: T;
}

function vigente<T>(tramos: Tramo<T>[], fecha: string): T {
  let v = tramos[0]!.valor;
  for (const t of tramos) if (t.desde <= fecha) v = t.valor;
  return v;
}

export const JORNADA_SEMANAL: Tramo<number>[] = [
  { desde: "0000-01-01", valor: 48 },
  { desde: "2023-07-15", valor: 47 },
  { desde: "2024-07-15", valor: 46 },
  { desde: "2025-07-15", valor: 44 },
  { desde: "2026-07-15", valor: 42 },
];

/** Minuto del día en que inicia la jornada nocturna (termina siempre a las 06:00). */
export const INICIO_NOCTURNO: Tramo<number>[] = [
  { desde: "0000-01-01", valor: 21 * 60 },
  { desde: "2025-12-25", valor: 19 * 60 },
];

export const RECARGO_DOMINICAL: Tramo<number>[] = [
  { desde: "0000-01-01", valor: 0.75 },
  { desde: "2025-07-01", valor: 0.8 },
  { desde: "2026-07-01", valor: 0.9 },
  { desde: "2027-07-01", valor: 1.0 },
];

export const FIN_NOCTURNO_MIN = 6 * 60;
export const RECARGO_NOCTURNO = 0.35;
export const RECARGO_EXTRA_DIURNA = 0.25;
export const RECARGO_EXTRA_NOCTURNA = 0.75;
/** Límites de trabajo suplementario (CST art. 22 Ley 50/1990). */
export const MAX_EXTRA_DIA_MIN = 2 * 60;
export const MAX_EXTRA_SEMANA_MIN = 12 * 60;

export const jornadaSemanal = (fecha: string) => vigente(JORNADA_SEMANAL, fecha);
export const divisorMensual = (fecha: string) => (jornadaSemanal(fecha) * 30) / 6;
export const inicioNocturno = (fecha: string) => vigente(INICIO_NOCTURNO, fecha);
export const recargoDominical = (fecha: string) => vigente(RECARGO_DOMINICAL, fecha);

export interface ParametrosVigentes {
  fecha: string;
  jornadaSemanal: number;
  divisorMensual: number;
  inicioNocturno: string;
  finNocturno: string;
  recargoNocturno: number;
  recargoDominical: number;
  recargoExtraDiurna: number;
  recargoExtraNocturna: number;
  maxExtraDiaHoras: number;
  maxExtraSemanaHoras: number;
}

export function parametrosVigentes(fecha: string): ParametrosVigentes {
  const ini = inicioNocturno(fecha);
  return {
    fecha,
    jornadaSemanal: jornadaSemanal(fecha),
    divisorMensual: divisorMensual(fecha),
    inicioNocturno: `${String(ini / 60).padStart(2, "0")}:00`,
    finNocturno: "06:00",
    recargoNocturno: RECARGO_NOCTURNO,
    recargoDominical: recargoDominical(fecha),
    recargoExtraDiurna: RECARGO_EXTRA_DIURNA,
    recargoExtraNocturna: RECARGO_EXTRA_NOCTURNA,
    maxExtraDiaHoras: MAX_EXTRA_DIA_MIN / 60,
    maxExtraSemanaHoras: MAX_EXTRA_SEMANA_MIN / 60,
  };
}
