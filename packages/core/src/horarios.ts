/**
 * Horarios de trabajo por grupo de empleados.
 *
 * - FIJO: horario administrativo con hora de entrada y salida por día (p. ej. L-V 08:00-17:00).
 *   Los minutos ordinarios del día se derivan de entrada - salida - descanso.
 * - TURNOS: personal operativo (bodega) con turnos variables; se define cuántas horas
 *   ordinarias corresponden a cada día de la semana.
 *
 * Ley 2101 de 2021 (CST art. 161): la jornada semanal puede distribuirse en máximo 6 días,
 * con jornadas diarias de 4 a 9 horas sin recargo por trabajo suplementario, y un día de descanso.
 * Lo que excede la jornada ordinaria del día (o cualquier hora en un día no laborable) es hora extra.
 */
import { jornadaSemanal } from "./parametros.js";

export type Descanso =
  /** Franja fija no remunerada, p. ej. almuerzo de 12:00 a 13:00. */
  | { tipo: "VENTANA"; inicio: string; fin: string }
  /** Pausa no remunerada de N minutos tras trabajar `despuesDe` minutos (turnos sin hora fija de almuerzo). */
  | { tipo: "DURACION"; minutos: number; despuesDe: number };

export interface DiaHorario {
  laborable: boolean;
  /** Minutos ordinarios del día (para FIJO se calculan desde inicio/fin). */
  minutos: number;
  inicio?: string | null;
  fin?: string | null;
}

export interface Horario {
  tipo: "FIJO" | "TURNOS";
  /** Índice 0 = domingo … 6 = sábado */
  dias: DiaHorario[];
  descanso: Descanso | null;
  /** Extras del turno iguales o menores a esta cifra no se reconocen (p. ej. salir 10 min tarde). */
  toleranciaMinutos: number;
  /** Si es true, las horas extra quedan pendientes hasta que un supervisor las apruebe. */
  requiereAprobacion: boolean;
}

export const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutos ordinarios de un día de horario fijo: entrada a salida menos la franja de descanso que caiga dentro. */
export function minutosHorarioFijo(inicio: string, fin: string, descanso: Descanso | null): number {
  const a = aMinutos(inicio);
  let b = aMinutos(fin);
  if (b <= a) b += 24 * 60; // horario que cruza la medianoche
  let total = b - a;
  if (descanso?.tipo === "VENTANA") {
    const da = aMinutos(descanso.inicio);
    const db = aMinutos(descanso.fin);
    total -= Math.max(0, Math.min(b, db) - Math.max(a, da));
  } else if (descanso?.tipo === "DURACION" && total > descanso.despuesDe) {
    total -= descanso.minutos;
  }
  return Math.max(0, total);
}

/** Minutos ordinarios que corresponden a un día de la semana (0 si no es laborable). */
export function minutosOrdinariosHorario(h: Horario, diaSemana: number): number {
  const d = h.dias[diaSemana];
  return d?.laborable ? d.minutos : 0;
}

export interface ValidacionHorario {
  errores: string[];
  avisos: string[];
  minutosSemana: number;
  jornadaLegalHoras: number;
}

/** Valida un horario contra la jornada legal vigente en `fecha`. */
export function validarHorario(h: Horario, fecha: string): ValidacionHorario {
  const errores: string[] = [];
  const avisos: string[] = [];
  if (h.dias.length !== 7) errores.push("El horario debe definir los 7 días de la semana.");
  const laborables = h.dias.filter((d) => d.laborable);
  if (laborables.length === 0) errores.push("Marca al menos un día laborable.");
  if (laborables.length > 6) errores.push("Debe haber al menos un día de descanso a la semana.");

  h.dias.forEach((d, i) => {
    if (!d.laborable) return;
    const nombre = NOMBRES_DIAS[i];
    if (h.tipo === "FIJO" && (!d.inicio || !d.fin)) errores.push(`${nombre}: indica la hora de entrada y de salida.`);
    if (d.minutos > 9 * 60) errores.push(`${nombre}: la jornada ordinaria diaria no puede superar 9 horas.`);
    else if (d.minutos < 4 * 60) avisos.push(`${nombre}: jornada de menos de 4 horas (solo válida en contratos de tiempo parcial).`);
  });

  if (h.descanso?.tipo === "VENTANA" && aMinutos(h.descanso.fin) <= aMinutos(h.descanso.inicio)) {
    errores.push("La franja de descanso debe terminar después de empezar.");
  }
  if (h.descanso?.tipo === "DURACION" && (h.descanso.minutos <= 0 || h.descanso.minutos > 180)) {
    errores.push("El descanso debe durar entre 1 y 180 minutos.");
  }

  const minutosSemana = laborables.reduce((s, d) => s + d.minutos, 0);
  const legal = jornadaSemanal(fecha);
  if (minutosSemana > legal * 60) {
    errores.push(
      `Suma ${(minutosSemana / 60).toLocaleString("es-CO")} h semanales y la jornada máxima vigente es de ${legal} h.`,
    );
  }
  return { errores, avisos, minutosSemana, jornadaLegalHoras: legal };
}

/** Horario por defecto cuando un empleado no tiene uno asignado: jornada legal en 6 días (L-S). */
export function horarioLegalPorDefecto(fecha: string): Horario {
  const minutos = Math.round((jornadaSemanal(fecha) / 6) * 60);
  return {
    tipo: "TURNOS",
    dias: Array.from({ length: 7 }, (_, i) => ({ laborable: i !== 0, minutos: i === 0 ? 0 : minutos })),
    descanso: null,
    toleranciaMinutos: 0,
    requiereAprobacion: false,
  };
}
