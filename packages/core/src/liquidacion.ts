/**
 * Motor de liquidación de recargos y horas extras (Colombia).
 *
 * Recorre la marcación minuto a minuto en hora de Colombia y clasifica cada minuto según:
 *   - ordinario vs. extra (supera la jornada ordinaria diaria del empleado),
 *   - diurno vs. nocturno (franja nocturna vigente en esa fecha),
 *   - día hábil vs. dominical/festivo.
 * Así se resuelven sin casos especiales los turnos que cruzan la medianoche, el paso de
 * sábado a domingo, festivos y cambios normativos que entran en vigencia a mitad de turno.
 *
 * El "factor" de cada categoría es lo que se paga ADICIONAL al salario ordinario,
 * expresado sobre el valor de la hora ordinaria:
 *   ORD_DIURNA        0                      (ya incluido en el salario)
 *   ORD_NOCTURNA      0,35                   recargo nocturno
 *   ORD_DIURNA_DF     d                      recargo dominical/festivo
 *   ORD_NOCTURNA_DF   d + 0,35
 *   EXT_DIURNA        1 + 0,25               hora extra diurna
 *   EXT_NOCTURNA      1 + 0,75               hora extra nocturna
 *   EXT_DIURNA_DF     1 + d + 0,25
 *   EXT_NOCTURNA_DF   1 + d + 0,75
 * donde d es el recargo dominical vigente (0,90 desde jul-2026).
 */
import type { CalendarioFestivos } from "./festivos.js";
import { aHoraLocal } from "./fechas.js";
import {
  FIN_NOCTURNO_MIN,
  MAX_EXTRA_DIA_MIN,
  RECARGO_EXTRA_DIURNA,
  RECARGO_EXTRA_NOCTURNA,
  RECARGO_NOCTURNO,
  divisorMensual,
  inicioNocturno,
  jornadaSemanal,
  recargoDominical,
} from "./parametros.js";

export const CATEGORIAS = [
  "ORD_DIURNA",
  "ORD_NOCTURNA",
  "ORD_DIURNA_DF",
  "ORD_NOCTURNA_DF",
  "EXT_DIURNA",
  "EXT_NOCTURNA",
  "EXT_DIURNA_DF",
  "EXT_NOCTURNA_DF",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETAS: Record<Categoria, { corta: string; larga: string }> = {
  ORD_DIURNA: { corta: "HOD", larga: "Ordinaria diurna" },
  ORD_NOCTURNA: { corta: "RN", larga: "Recargo nocturno" },
  ORD_DIURNA_DF: { corta: "RDF", larga: "Recargo dominical/festivo diurno" },
  ORD_NOCTURNA_DF: { corta: "RNDF", larga: "Recargo dominical/festivo nocturno" },
  EXT_DIURNA: { corta: "HED", larga: "Extra diurna" },
  EXT_NOCTURNA: { corta: "HEN", larga: "Extra nocturna" },
  EXT_DIURNA_DF: { corta: "HEDDF", larga: "Extra diurna dominical/festiva" },
  EXT_NOCTURNA_DF: { corta: "HENDF", larga: "Extra nocturna dominical/festiva" },
};

export const esExtra = (c: Categoria) => c.startsWith("EXT_");

export function factorCategoria(c: Categoria, recargoDF: number): number {
  switch (c) {
    case "ORD_DIURNA":
      return 0;
    case "ORD_NOCTURNA":
      return RECARGO_NOCTURNO;
    case "ORD_DIURNA_DF":
      return recargoDF;
    case "ORD_NOCTURNA_DF":
      return recargoDF + RECARGO_NOCTURNO;
    case "EXT_DIURNA":
      return 1 + RECARGO_EXTRA_DIURNA;
    case "EXT_NOCTURNA":
      return 1 + RECARGO_EXTRA_NOCTURNA;
    case "EXT_DIURNA_DF":
      return 1 + recargoDF + RECARGO_EXTRA_DIURNA;
    case "EXT_NOCTURNA_DF":
      return 1 + recargoDF + RECARGO_EXTRA_NOCTURNA;
  }
}

export interface EntradaLiquidacion {
  entrada: Date;
  salida: Date;
  salarioMensual: number;
  calendario: CalendarioFestivos;
  /**
   * Minutos de jornada ordinaria diaria pactada. Si no se indica, se usa
   * jornada semanal legal vigente / 6 (p. ej. 42 h → 7 h = 420 min).
   */
  minutosOrdinariosDia?: number | null;
  /** Minutos ya trabajados ese mismo día en marcaciones anteriores (cuentan para la jornada). */
  minutosPreviosDia?: number;
}

export interface LineaLiquidacion {
  categoria: Categoria;
  minutos: number;
  factor: number;
  valor: number;
}

export interface ResultadoLiquidacion {
  fechaBase: string;
  valorHora: number;
  divisor: number;
  minutosOrdinariosDia: number;
  minutosTotales: number;
  minutosOrdinarios: number;
  minutosExtra: number;
  minutosNocturnos: number;
  minutosDominicalFestivo: number;
  lineas: LineaLiquidacion[];
  valorTotal: number;
  alertas: string[];
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function minutosOrdinariosPorDefecto(fecha: string): number {
  return Math.round((jornadaSemanal(fecha) / 6) * 60);
}

export function liquidar(p: EntradaLiquidacion): ResultadoLiquidacion {
  if (p.salida.getTime() < p.entrada.getTime()) {
    throw new Error("La salida no puede ser anterior a la entrada");
  }
  const inicio = aHoraLocal(p.entrada);
  const fechaBase = inicio.fecha;
  const divisor = divisorMensual(fechaBase);
  const valorHora = p.salarioMensual / divisor;
  const limite = p.minutosOrdinariosDia ?? minutosOrdinariosPorDefecto(fechaBase);
  const previos = Math.max(0, p.minutosPreviosDia ?? 0);

  const total = Math.floor((p.salida.getTime() - p.entrada.getTime()) / 60_000);
  const acumulado = new Map<string, LineaLiquidacion>();
  let nocturnos = 0;
  let df = 0;

  for (let m = 0; m < total; m++) {
    const t = aHoraLocal(new Date(p.entrada.getTime() + m * 60_000));
    const nocturno =
      t.minutoDelDia >= inicioNocturno(t.fecha) || t.minutoDelDia < FIN_NOCTURNO_MIN;
    const dominicalFestivo = t.diaSemana === 0 || p.calendario.esFestivo(t.fecha);
    const extra = previos + m >= limite;

    const categoria = `${extra ? "EXT" : "ORD"}_${nocturno ? "NOCTURNA" : "DIURNA"}${
      dominicalFestivo ? "_DF" : ""
    }` as Categoria;
    const factor = factorCategoria(categoria, recargoDominical(t.fecha));
    const clave = `${categoria}|${factor}`;

    const linea = acumulado.get(clave);
    if (linea) linea.minutos++;
    else acumulado.set(clave, { categoria, minutos: 1, factor, valor: 0 });

    if (nocturno) nocturnos++;
    if (dominicalFestivo) df++;
  }

  const lineas = [...acumulado.values()]
    .map((l) => ({ ...l, valor: redondear((l.minutos / 60) * valorHora * l.factor) }))
    .sort((a, b) => CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria));

  const minutosExtra = lineas.filter((l) => esExtra(l.categoria)).reduce((s, l) => s + l.minutos, 0);
  const alertas: string[] = [];
  const extraDia = Math.max(0, previos + total - limite) ;
  if (extraDia > MAX_EXTRA_DIA_MIN) {
    alertas.push(
      `Supera el máximo legal de 2 horas extra diarias (${(extraDia / 60).toFixed(2)} h en el día).`,
    );
  }
  if (total > 16 * 60) alertas.push("Turno de más de 16 horas: verifique la marcación.");

  return {
    fechaBase,
    valorHora: redondear(valorHora),
    divisor,
    minutosOrdinariosDia: limite,
    minutosTotales: total,
    minutosOrdinarios: total - minutosExtra,
    minutosExtra,
    minutosNocturnos: nocturnos,
    minutosDominicalFestivo: df,
    lineas,
    valorTotal: redondear(lineas.reduce((s, l) => s + l.valor, 0)),
    alertas,
  };
}
