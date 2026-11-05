import type { FechaLocal } from './zona.js';

/**
 * Parámetros legales con vigencia por fecha (fecha civil de Colombia).
 * Cada tabla está ordenada por `desde` ascendente; rige el último tramo con
 * `desde <= fecha`.
 */
interface Tramo<T> {
  desde: FechaLocal;
  valor: T;
  fuente: string;
}

function vigente<T>(tabla: Tramo<T>[], fecha: FechaLocal): T {
  let res: Tramo<T> | undefined;
  for (const t of tabla) if (t.desde <= fecha) res = t;
  if (!res) throw new Error(`Sin parámetro vigente para ${fecha}`);
  return res.valor;
}

/** Horas semanales máximas (Ley 2101 de 2021, reducción gradual). */
export const JORNADA_SEMANAL: Tramo<number>[] = [
  { desde: '1990-01-01', valor: 48, fuente: 'CST art. 161' },
  { desde: '2023-07-15', valor: 47, fuente: 'Ley 2101/2021' },
  { desde: '2024-07-15', valor: 46, fuente: 'Ley 2101/2021' },
  { desde: '2025-07-15', valor: 44, fuente: 'Ley 2101/2021' },
  { desde: '2026-07-15', valor: 42, fuente: 'Ley 2101/2021' },
];

/** Inicio de la jornada nocturna, en minutos desde medianoche. Termina a las 06:00. */
export const INICIO_NOCTURNA: Tramo<number>[] = [
  { desde: '1990-01-01', valor: 21 * 60, fuente: 'Ley 1846/2017' },
  { desde: '2025-12-25', valor: 19 * 60, fuente: 'Ley 2466/2025 art. 10' },
];
export const FIN_NOCTURNA_MIN = 6 * 60;

/** Recargo por trabajo en domingo o festivo (Ley 2466/2025, gradual). */
export const RECARGO_DOMINICAL: Tramo<number>[] = [
  { desde: '1990-01-01', valor: 0.75, fuente: 'CST art. 179' },
  { desde: '2025-07-01', valor: 0.8, fuente: 'Ley 2466/2025' },
  { desde: '2026-07-01', valor: 0.9, fuente: 'Ley 2466/2025' },
  { desde: '2027-07-01', valor: 1.0, fuente: 'Ley 2466/2025' },
];

export const RECARGO_NOCTURNO = 0.35;
export const RECARGO_EXTRA_DIURNA = 0.25;
export const RECARGO_EXTRA_NOCTURNA = 0.75;
export const ALERTA_EXTRAS_DIA_MIN = 2 * 60;
export const ALERTA_EXTRAS_SEMANA_MIN = 12 * 60;

export interface ParametrosDia {
  jornadaSemanalHoras: number;
  /** Divisor mensual del salario para hallar el valor de la hora (jornada × 5). */
  divisorMensual: number;
  /** Jornada ordinaria diaria por defecto en minutos (jornada semanal ÷ 6). */
  jornadaDiariaMin: number;
  inicioNocturnaMin: number;
  finNocturnaMin: number;
  recargoDominical: number;
}

const cache = new Map<FechaLocal, ParametrosDia>();

export function parametrosEn(fecha: FechaLocal): ParametrosDia {
  let p = cache.get(fecha);
  if (!p) {
    const jornada = vigente(JORNADA_SEMANAL, fecha);
    p = {
      jornadaSemanalHoras: jornada,
      divisorMensual: jornada * 5,
      jornadaDiariaMin: Math.round((jornada * 60) / 6),
      inicioNocturnaMin: vigente(INICIO_NOCTURNA, fecha),
      finNocturnaMin: FIN_NOCTURNA_MIN,
      recargoDominical: vigente(RECARGO_DOMINICAL, fecha),
    };
    cache.set(fecha, p);
  }
  return p;
}
