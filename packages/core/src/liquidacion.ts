import { Calendario } from './festivos.js';
import {
  ALERTA_EXTRAS_DIA_MIN,
  ALERTA_EXTRAS_SEMANA_MIN,
  RECARGO_EXTRA_DIURNA,
  RECARGO_EXTRA_NOCTURNA,
  RECARGO_NOCTURNO,
  parametrosEn,
} from './parametros.js';
import { type FechaLocal, fechaLocal, lunesDeSemana, minutoDelDia } from './zona.js';

/**
 * Motor de liquidación minuto a minuto.
 *
 * Reglas:
 * - Cada minuto se clasifica con la fecha y hora de Colombia de ESE minuto
 *   (nocturno, dominical/festivo, parámetros vigentes).
 * - La jornada ordinaria se asigna al día civil en que empieza el turno y se
 *   consume entre todos los turnos de ese día (turnos partidos). Superada, el
 *   resto es extra.
 * - Las alertas de extras no bloquean nada; solo informan.
 * - Los segundos sueltos se descartan: se cuentan minutos completos.
 */
export interface Turno {
  entrada: Date;
  salida: Date;
}

export const CATEGORIAS = [
  'ordinariaDiurna',
  'ordinariaNocturna',
  'ordinariaDiurnaDominical',
  'ordinariaNocturnaDominical',
  'extraDiurna',
  'extraNocturna',
  'extraDiurnaDominical',
  'extraNocturnaDominical',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type Minutos = Record<Categoria, number>;

export interface ResumenDia {
  fecha: FechaLocal;
  minutos: Minutos;
  totalMin: number;
  extrasMin: number;
  jornadaDiariaMin: number;
  /**
   * Suma, minuto a minuto, del factor que se paga ADEMÁS del salario básico
   * (recargos de ordinarias; 1 + recargo de extras). Se multiplica por el valor
   * del minuto para obtener el valor adicional.
   */
  minutosPonderados: number;
  divisorMensual: number;
  alertaExtrasDia: boolean;
}

export interface ResumenSemana {
  lunes: FechaLocal;
  extrasMin: number;
  alertaExtrasSemana: boolean;
}

export interface Liquidacion {
  dias: ResumenDia[];
  semanas: ResumenSemana[];
}

export interface OpcionesLiquidacion {
  calendario?: Calendario;
  /** Jornada diaria pactada con el empleado, en minutos. Por defecto: legal ÷ 6. */
  jornadaPactadaMin?: number;
}

const MS_MIN = 60_000;

function minutosVacios(): Minutos {
  return Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Minutos;
}

function categoria(extra: boolean, nocturna: boolean, dominical: boolean): Categoria {
  const base = extra ? 'extra' : 'ordinaria';
  const franja = nocturna ? 'Nocturna' : 'Diurna';
  return `${base}${franja}${dominical ? 'Dominical' : ''}` as Categoria;
}

export function liquidar(turnos: Turno[], opciones: OpcionesLiquidacion = {}): Liquidacion {
  const calendario = opciones.calendario ?? new Calendario();
  const dias = new Map<FechaLocal, ResumenDia>();

  const ordenados = [...turnos].sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
  for (const t of ordenados) {
    const inicio = Math.floor(t.entrada.getTime() / MS_MIN) * MS_MIN;
    const total = Math.floor((t.salida.getTime() - t.entrada.getTime()) / MS_MIN);
    if (total <= 0) continue;

    const fechaJornada = fechaLocal(t.entrada);
    let dia = dias.get(fechaJornada);
    if (!dia) {
      const p = parametrosEn(fechaJornada);
      dia = {
        fecha: fechaJornada,
        minutos: minutosVacios(),
        totalMin: 0,
        extrasMin: 0,
        jornadaDiariaMin: opciones.jornadaPactadaMin ?? p.jornadaDiariaMin,
        minutosPonderados: 0,
        divisorMensual: p.divisorMensual,
        alertaExtrasDia: false,
      };
      dias.set(fechaJornada, dia);
    }

    for (let i = 0; i < total; i++) {
      const instante = new Date(inicio + i * MS_MIN);
      const fechaMin = fechaLocal(instante);
      const mdd = minutoDelDia(instante);
      const p = parametrosEn(fechaMin);
      const nocturna = mdd >= p.inicioNocturnaMin || mdd < p.finNocturnaMin;
      const dominical = calendario.esDominicalOFestivo(fechaMin);
      const extra = dia.totalMin - dia.extrasMin >= dia.jornadaDiariaMin;

      dia.minutos[categoria(extra, nocturna, dominical)]++;
      dia.totalMin++;
      if (extra) dia.extrasMin++;

      let factor = 0;
      if (extra) factor += 1 + (nocturna ? RECARGO_EXTRA_NOCTURNA : RECARGO_EXTRA_DIURNA);
      else if (nocturna) factor += RECARGO_NOCTURNO;
      if (dominical) factor += p.recargoDominical;
      dia.minutosPonderados += factor;
    }
  }

  const listaDias = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const semanas = new Map<FechaLocal, ResumenSemana>();
  for (const d of listaDias) {
    d.alertaExtrasDia = d.extrasMin > ALERTA_EXTRAS_DIA_MIN;
    const lunes = lunesDeSemana(d.fecha);
    const s = semanas.get(lunes) ?? { lunes, extrasMin: 0, alertaExtrasSemana: false };
    s.extrasMin += d.extrasMin;
    s.alertaExtrasSemana = s.extrasMin > ALERTA_EXTRAS_SEMANA_MIN;
    semanas.set(lunes, s);
  }

  return { dias: listaDias, semanas: [...semanas.values()] };
}

/** Valor adicional al salario básico para un día, en pesos (redondeado). */
export function valorAdicionalDia(dia: ResumenDia, salarioMensual: number): number {
  const valorHora = salarioMensual / dia.divisorMensual;
  return Math.round((dia.minutosPonderados / 60) * valorHora);
}
