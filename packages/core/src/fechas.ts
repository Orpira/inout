/**
 * Utilidades de fecha en hora legal de Colombia (America/Bogota).
 * Colombia usa UTC-5 todo el año (sin horario de verano), así que el
 * desplazamiento fijo es exacto y evita depender de la zona del servidor.
 */
export const OFFSET_COLOMBIA_MIN = -5 * 60;
const MS_MIN = 60_000;

export interface HoraLocal {
  /** Fecha local en formato YYYY-MM-DD */
  fecha: string;
  anio: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  /** Minutos transcurridos desde la medianoche local */
  minutoDelDia: number;
  /** 0 = domingo … 6 = sábado */
  diaSemana: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function aHoraLocal(d: Date): HoraLocal {
  const l = new Date(d.getTime() + OFFSET_COLOMBIA_MIN * MS_MIN);
  const anio = l.getUTCFullYear();
  const mes = l.getUTCMonth() + 1;
  const dia = l.getUTCDate();
  const hora = l.getUTCHours();
  const minuto = l.getUTCMinutes();
  return {
    fecha: `${anio}-${pad(mes)}-${pad(dia)}`,
    anio,
    mes,
    dia,
    hora,
    minuto,
    minutoDelDia: hora * 60 + minuto,
    diaSemana: l.getUTCDay(),
  };
}

export function fechaLocal(d: Date): string {
  return aHoraLocal(d).fecha;
}

/** Construye un instante a partir de fecha (YYYY-MM-DD) y hora (HH:mm) locales de Colombia. */
export function desdeLocal(fecha: string, hora = "00:00"): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const utc = Date.UTC(a!, m! - 1, d!, h ?? 0, mi ?? 0);
  return new Date(utc - OFFSET_COLOMBIA_MIN * MS_MIN);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay();
}

/** Lunes (YYYY-MM-DD) de la semana ISO a la que pertenece la fecha. */
export function lunesDeSemana(fecha: string): string {
  const ds = diaSemana(fecha);
  return sumarDias(fecha, ds === 0 ? -6 : 1 - ds);
}

/** "HH:mm" a partir de minutos. */
export function formatearMinutos(min: number): string {
  const signo = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${signo}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
