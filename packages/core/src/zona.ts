/**
 * Hora legal de Colombia.
 *
 * Colombia usa UTC-5 todo el año (sin horario de verano desde 1993), así que el
 * desfase es fijo. Todas las conversiones se hacen con aritmética explícita sobre
 * el instante UTC: el resultado NO depende de la zona del proceso (TZ del
 * servidor, del contenedor o del navegador). Nunca usar getHours()/getDate()
 * locales ni `new Date('YYYY-MM-DD')` para lógica de negocio.
 */
export const ZONA_HORARIA = 'America/Bogota';
export const DESFASE_MINUTOS = -5 * 60;

const MS_MIN = 60_000;
const MS_DIA = 86_400_000;

/** Fecha civil 'YYYY-MM-DD' en Colombia. */
export type FechaLocal = string;

export interface PartesLocales {
  anio: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo … 6 = sábado */
  diaSemana: number;
}

/** Desplaza el instante para leer sus campos UTC como si fueran hora de Colombia. */
function desplazado(instante: Date): Date {
  return new Date(instante.getTime() + DESFASE_MINUTOS * MS_MIN);
}

export function partesLocales(instante: Date): PartesLocales {
  const d = desplazado(instante);
  return {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  };
}

/** Minuto del día en Colombia (0-1439). */
export function minutoDelDia(instante: Date): number {
  const p = partesLocales(instante);
  return p.hora * 60 + p.minuto;
}

const dos = (n: number) => String(n).padStart(2, '0');

export function fechaLocal(instante: Date): FechaLocal {
  const p = partesLocales(instante);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

/** 'HH:mm' en Colombia. */
export function horaLocal(instante: Date): string {
  const p = partesLocales(instante);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

function parseFecha(fecha: FechaLocal): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Instante UTC que corresponde a una fecha y hora civil de Colombia. */
export function desdeLocal(fecha: FechaLocal, hora = '00:00'): Date {
  const [a, m, d] = parseFecha(fecha);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!h) throw new Error(`Hora inválida: ${hora}`);
  const utc = Date.UTC(a, m - 1, d, Number(h[1]), Number(h[2]));
  return new Date(utc - DESFASE_MINUTOS * MS_MIN);
}

/** Suma días a una fecha civil (aritmética de calendario, sin zona). */
export function sumarDias(fecha: FechaLocal, dias: number): FechaLocal {
  const [a, m, d] = parseFecha(fecha);
  const t = new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA);
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

export function diaSemanaDeFecha(fecha: FechaLocal): number {
  const [a, m, d] = parseFecha(fecha);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Lunes (fecha civil) de la semana a la que pertenece la fecha. */
export function lunesDeSemana(fecha: FechaLocal): FechaLocal {
  const dow = diaSemanaDeFecha(fecha);
  return sumarDias(fecha, -((dow + 6) % 7));
}

/** Formato legible para pantallas, siempre en hora de Colombia. */
export function formatearLocal(instante: Date, opciones: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, ...opciones }).format(instante);
}
