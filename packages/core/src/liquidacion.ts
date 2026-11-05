import { Calendario } from './festivos.js';
import {
  ALERTA_EXTRAS_DIA_MIN,
  ALERTA_EXTRAS_SEMANA_MIN,
  RECARGO_EXTRA_DIURNA,
  RECARGO_EXTRA_NOCTURNA,
  RECARGO_NOCTURNO,
  parametrosEn,
} from './parametros.js';
import { type HorarioTurno, type VentanasTurno, ventanasTurno } from './turnos.js';
import { type FechaLocal, diaSemanaDeFecha, fechaLocal, lunesDeSemana, minutoDelDia, sumarDias } from './zona.js';

/**
 * Motor de liquidación minuto a minuto.
 *
 * Jornada ordinaria de cada día (CST art. 158-159: es extra lo que excede la
 * jornada ordinaria pactada y, en todo caso, la máxima legal):
 * - Día con turno programado: las horas del turno (sin el descanso).
 * - Día de descanso programado: 0; todo lo trabajado es extra.
 * - Día sin programar: la jornada pactada del empleado o, si no tiene, la
 *   legal vigente ÷ 6.
 *
 * Qué minutos son extra: primero son ordinarios los que caen dentro del
 * horario del turno; si el empleado trabajó menos dentro del horario (llegó
 * tarde, salió antes), los minutos de fuera del horario completan la jornada
 * en orden cronológico, y solo el resto es extra. Sin turno, simplemente los
 * primeros minutos del día son ordinarios.
 *
 * Festivos: si el turno cae en festivo y se trabaja, las horas del turno son
 * ordinarias con recargo; si no se trabaja, no es ausencia.
 *
 * Descanso intermedio: si el turno lo tiene y el empleado no marcó ninguna
 * pausa de al menos esa duración, se presume tomado en su horario y esos
 * minutos no se cuentan.
 *
 * Cada minuto se clasifica con la fecha y hora de Colombia de ESE minuto
 * (nocturno, día de descanso obligatorio/festivo, parámetros vigentes). El
 * recargo dominical se aplica a los festivos y al día de descanso obligatorio
 * del empleado: el domingo, salvo pacto escrito de otro día (CST art. 179,
 * mod. Ley 2466/2025).
 *
 * Un turno trabajado pertenece al día en que empieza, salvo que se solape con
 * el turno programado del día anterior (turnos nocturnos que cruzan la
 * medianoche y se empiezan tarde). Los segundos sueltos se descartan.
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

/** Lo programado para un día: un horario, o null si es día de descanso. */
export type Programacion = Map<FechaLocal, HorarioTurno | null>;

export type DiaProgramado = ({ tipo: 'TURNO'; ordinariaMin: number } & HorarioTurno) | { tipo: 'DESCANSO' };

export interface ResumenDia {
  fecha: FechaLocal;
  minutos: Minutos;
  totalMin: number;
  extrasMin: number;
  /** Jornada ordinaria que se aplicó ese día, en minutos. */
  jornadaDiariaMin: number;
  /** De dónde sale la jornada del día. */
  origenJornada: 'TURNO' | 'DESCANSO' | 'PACTADA' | 'LEGAL';
  /**
   * Suma, minuto a minuto, del factor que se paga ADEMÁS del salario básico
   * (recargos de ordinarias; 1 + recargo de extras). Se multiplica por el valor
   * del minuto para obtener el valor adicional.
   */
  minutosPonderados: number;
  divisorMensual: number;
  alertaExtrasDia: boolean;
  /** Cumplimiento del turno programado (null si el día no estaba programado). */
  programado: DiaProgramado | null;
  /** Minutos tarde respecto al inicio del turno. */
  tardanzaMin: number;
  /** Minutos antes del fin del turno en que salió. */
  salidaAnticipadaMin: number;
  /** Turno ya terminado sin ninguna marcación. */
  ausente: boolean;
  /** Minutos descontados por descanso presunto (no marcó la pausa). */
  descansoPresuntoMin: number;
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
  /** Turnos programados del empleado. Los días que no aparezcan van sin programar. */
  programacion?: Programacion;
  /** Día de descanso obligatorio (0 = domingo … 6 = sábado). Por defecto domingo. */
  diaDescanso?: number;
  /** Momento de referencia para decidir si un turno ya terminó (ausencias). */
  ahora?: Date;
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

const solapa = (t: Turno, v: VentanasTurno) => t.entrada < v.fin && t.salida > v.inicio;

export function liquidar(turnos: Turno[], opciones: OpcionesLiquidacion = {}): Liquidacion {
  const calendario = opciones.calendario ?? new Calendario();
  const programacion: Programacion = opciones.programacion ?? new Map();
  const diaDescanso = opciones.diaDescanso ?? 0;
  const ahora = opciones.ahora ?? new Date();
  const esDescansoOFestivo = (f: FechaLocal) => diaSemanaDeFecha(f) === diaDescanso || calendario.esFestivo(f);

  const ventanas = new Map<FechaLocal, VentanasTurno>();
  for (const [fecha, h] of programacion) if (h) ventanas.set(fecha, ventanasTurno(fecha, h));

  // 1. Minutos trabajados por día de jornada.
  const trabajados = new Map<FechaLocal, Set<number>>();
  for (const t of turnos) {
    const inicio = Math.floor(t.entrada.getTime() / MS_MIN) * MS_MIN;
    const total = Math.floor((t.salida.getTime() - t.entrada.getTime()) / MS_MIN);
    if (total <= 0) continue;
    const propia = fechaLocal(t.entrada);
    const anterior = sumarDias(propia, -1);
    const vAnterior = ventanas.get(anterior);
    const fecha = !ventanas.has(propia) && vAnterior && solapa(t, vAnterior) ? anterior : propia;
    const set = trabajados.get(fecha) ?? new Set<number>();
    for (let i = 0; i < total; i++) set.add(inicio + i * MS_MIN);
    trabajados.set(fecha, set);
  }

  // Días programados con turno ya terminado y sin trabajo: ausencias. Un
  // festivo no trabajado es descanso legal (CST art. 177), no ausencia.
  for (const [fecha, v] of ventanas)
    if (!trabajados.has(fecha) && v.fin <= ahora && !calendario.esFestivo(fecha)) trabajados.set(fecha, new Set());

  // 2. Clasificación de cada día.
  const dias: ResumenDia[] = [];
  for (const [fecha, set] of trabajados) {
    let minutos = [...set].sort((a, b) => a - b);
    const p = parametrosEn(fecha);
    const prog = programacion.get(fecha);
    const v = ventanas.get(fecha);

    let descansoPresuntoMin = 0;
    if (v?.descanso && minutos.length) {
      const pausaMs = v.descanso.fin.getTime() - v.descanso.inicio.getTime();
      const marcoPausa = minutos.some((m, i) => i > 0 && m - minutos[i - 1]! - MS_MIN >= pausaMs);
      if (!marcoPausa) {
        const { inicio, fin } = v.descanso;
        const antes = minutos.length;
        minutos = minutos.filter((m) => m < inicio.getTime() || m >= fin.getTime());
        descansoPresuntoMin = antes - minutos.length;
      }
    }

    const dentro = (m: number) =>
      !!v && m >= v.inicio.getTime() && m < v.fin.getTime() && !(v.descanso && m >= v.descanso.inicio.getTime() && m < v.descanso.fin.getTime());

    const origenJornada: ResumenDia['origenJornada'] = v ? 'TURNO' : prog === null ? 'DESCANSO' : opciones.jornadaPactadaMin ? 'PACTADA' : 'LEGAL';
    const jornadaDiariaMin = v ? v.ordinariaMin : prog === null ? 0 : (opciones.jornadaPactadaMin ?? p.jornadaDiariaMin);
    let restanteFuera = jornadaDiariaMin - minutos.filter(dentro).length;

    const dia: ResumenDia = {
      fecha,
      minutos: minutosVacios(),
      totalMin: 0,
      extrasMin: 0,
      jornadaDiariaMin,
      origenJornada,
      minutosPonderados: 0,
      divisorMensual: p.divisorMensual,
      alertaExtrasDia: false,
      programado: v && prog ? { tipo: 'TURNO', ordinariaMin: v.ordinariaMin, ...prog } : prog === null ? { tipo: 'DESCANSO' } : null,
      tardanzaMin: 0,
      salidaAnticipadaMin: 0,
      ausente: false,
      descansoPresuntoMin,
    };

    for (const m of minutos) {
      const instante = new Date(m);
      const fechaMin = fechaLocal(instante);
      const mdd = minutoDelDia(instante);
      const pm = parametrosEn(fechaMin);
      const nocturna = mdd >= pm.inicioNocturnaMin || mdd < pm.finNocturnaMin;
      const dominical = esDescansoOFestivo(fechaMin);
      const extra = !dentro(m) && restanteFuera-- <= 0;

      dia.minutos[categoria(extra, nocturna, dominical)]++;
      dia.totalMin++;
      if (extra) dia.extrasMin++;

      let factor = 0;
      if (extra) factor += 1 + (nocturna ? RECARGO_EXTRA_NOCTURNA : RECARGO_EXTRA_DIURNA);
      else if (nocturna) factor += RECARGO_NOCTURNO;
      if (dominical) factor += pm.recargoDominical;
      dia.minutosPonderados += factor;
    }

    if (v) {
      const primero = minutos[0];
      const ultimo = minutos.at(-1);
      if (primero === undefined || ultimo === undefined) dia.ausente = true;
      else {
        dia.tardanzaMin = Math.max(0, Math.round((primero - v.inicio.getTime()) / MS_MIN));
        dia.salidaAnticipadaMin = Math.max(0, Math.round((v.fin.getTime() - ultimo - MS_MIN) / MS_MIN));
      }
    }
    dias.push(dia);
  }

  // 3. Alertas de extras.
  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const semanas = new Map<FechaLocal, ResumenSemana>();
  for (const d of dias) {
    d.alertaExtrasDia = d.extrasMin > ALERTA_EXTRAS_DIA_MIN;
    const lunes = lunesDeSemana(d.fecha);
    const s = semanas.get(lunes) ?? { lunes, extrasMin: 0, alertaExtrasSemana: false };
    s.extrasMin += d.extrasMin;
    s.alertaExtrasSemana = s.extrasMin > ALERTA_EXTRAS_SEMANA_MIN;
    semanas.set(lunes, s);
  }

  return { dias, semanas: [...semanas.values()] };
}

/** Valor adicional al salario básico para un día, en pesos (redondeado). */
export function valorAdicionalDia(dia: ResumenDia, salarioMensual: number): number {
  const valorHora = salarioMensual / dia.divisorMensual;
  return Math.round((dia.minutosPonderados / 60) * valorHora);
}
