/**
 * Utilidades de fecha en la hora local de la empresa.
 *
 * La zona horaria es configurable (IANA, p. ej. "America/Bogota" o "Europe/Madrid") y por
 * defecto es la de Colombia. Se aplica con `establecerZona` al arrancar la API y al cargar la
 * web; el resto del código trabaja con fechas y horas locales sin depender de la zona del
 * servidor ni del navegador. Las zonas con horario de verano se resuelven con Intl.
 */
export const ZONA_PREDETERMINADA = "America/Bogota";
/** @deprecated Usa la zona configurada. Se conserva por compatibilidad. */
export const OFFSET_COLOMBIA_MIN = -5 * 60;
const MS_MIN = 60_000;
/** Los cambios de horario ocurren en múltiplos de 15 min: el desfase se cachea por tramos de 15 min. */
const TRAMO_MS = 15 * MS_MIN;
const DIA_MS = 24 * 60 * MS_MIN;

let zonaActual = ZONA_PREDETERMINADA;
const formateadores = new Map<string, Intl.DateTimeFormat>();
const cacheDesfase = new Map<string, number>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formateadores.set(zona, f);
  }
  return f;
}

/** true si el texto es una zona IANA que reconoce el entorno. */
export function esZonaValida(zona: string): boolean {
  if (!zona || !/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(zona)) return false;
  try {
    formateador(zona);
    return true;
  } catch {
    return false;
  }
}

/** Cambia la zona horaria con la que se interpretan todas las fechas locales. */
export function establecerZona(zona: string): void {
  if (!esZonaValida(zona)) throw new Error(`Zona horaria no válida: ${zona}`);
  zonaActual = zona;
}

export function zonaHoraria(): string {
  return zonaActual;
}

/** Minutos que hay que sumar a UTC para obtener la hora local de la zona en ese instante. */
export function desfaseMinutos(d: Date | number, zona = zonaActual): number {
  const t = typeof d === "number" ? d : d.getTime();
  const tramo = Math.floor(t / TRAMO_MS);
  const clave = `${zona}|${tramo}`;
  const cache = cacheDesfase.get(clave);
  if (cache !== undefined) return cache;
  const p: Record<string, number> = {};
  for (const { type, value } of formateador(zona).formatToParts(new Date(tramo * TRAMO_MS))) {
    if (type !== "literal") p[type] = Number(value);
  }
  const comoUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  const desfase = Math.round((comoUtc - tramo * TRAMO_MS) / MS_MIN);
  if (cacheDesfase.size > 50_000) cacheDesfase.clear();
  cacheDesfase.set(clave, desfase);
  return desfase;
}

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

export function aHoraLocal(d: Date, zona = zonaActual): HoraLocal {
  const l = new Date(d.getTime() + desfaseMinutos(d, zona) * MS_MIN);
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

export function fechaLocal(d: Date, zona = zonaActual): string {
  return aHoraLocal(d, zona).fecha;
}

/**
 * Construye un instante a partir de fecha (YYYY-MM-DD) y hora (HH:mm) locales.
 * Si la hora no existe (salto de horario de verano) se adelanta; si se repite, se toma la primera.
 */
export function desdeLocal(fecha: string, hora = "00:00", zona = zonaActual): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const pared = Date.UTC(a!, m! - 1, d!, h ?? 0, mi ?? 0);
  // Desfases antes y después de cualquier cambio de horario cercano.
  const antes = desfaseMinutos(pared - DIA_MS, zona);
  const despues = desfaseMinutos(pared + DIA_MS, zona);
  const validos = [antes, despues].filter((o) => desfaseMinutos(pared - o * MS_MIN, zona) === o);
  // Repetida: la primera (mayor desfase). Inexistente: con el desfase anterior queda adelantada.
  const desfase = validos.length ? Math.max(...validos) : antes;
  return new Date(pared - desfase * MS_MIN);
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
