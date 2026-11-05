import { type FechaLocal, diaSemanaDeFecha, sumarDias } from './zona.js';

/**
 * Festivos de Colombia.
 * - Ley 51 de 1983 ("Ley Emiliani"): ciertos festivos se trasladan al lunes siguiente.
 * - Ley 2578 de 2026: 9 de julio desde 2026 (demandada; por eso se puede desactivar
 *   con un ajuste desde el panel).
 */
export interface Festivo {
  fecha: FechaLocal;
  nombre: string;
}

/** Ajuste manual del calendario desde el panel. */
export interface AjusteFestivo {
  fecha: FechaLocal;
  nombre?: string;
  tipo: 'AGREGAR' | 'QUITAR';
}

const dos = (n: number) => String(n).padStart(2, '0');
const f = (a: number, m: number, d: number): FechaLocal => `${a}-${dos(m)}-${dos(d)}`;

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): FechaLocal {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const g = Math.floor((b + 8) / 25);
  const h = Math.floor((b - g + 1) / 3);
  const i = (19 * a + b - d - h + 15) % 30;
  const k = Math.floor(c / 4);
  const l = c % 4;
  const m = (32 + 2 * e + 2 * k - i - l) % 7;
  const n = Math.floor((a + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31);
  const dia = ((i + m - 7 * n + 114) % 31) + 1;
  return f(anio, mes, dia);
}

/** Traslada al lunes siguiente si no cae en lunes. */
function aLunes(fecha: FechaLocal): FechaLocal {
  const dow = diaSemanaDeFecha(fecha);
  return dow === 1 ? fecha : sumarDias(fecha, (8 - dow) % 7);
}

export function festivosBase(anio: number): Festivo[] {
  const pascua = domingoDePascua(anio);
  const lista: Festivo[] = [
    { fecha: f(anio, 1, 1), nombre: 'Año Nuevo' },
    { fecha: aLunes(f(anio, 1, 6)), nombre: 'Reyes Magos' },
    { fecha: aLunes(f(anio, 3, 19)), nombre: 'San José' },
    { fecha: sumarDias(pascua, -3), nombre: 'Jueves Santo' },
    { fecha: sumarDias(pascua, -2), nombre: 'Viernes Santo' },
    { fecha: f(anio, 5, 1), nombre: 'Día del Trabajo' },
    { fecha: aLunes(sumarDias(pascua, 39)), nombre: 'Ascensión del Señor' },
    { fecha: aLunes(sumarDias(pascua, 60)), nombre: 'Corpus Christi' },
    { fecha: aLunes(sumarDias(pascua, 68)), nombre: 'Sagrado Corazón' },
    { fecha: aLunes(f(anio, 6, 29)), nombre: 'San Pedro y San Pablo' },
    { fecha: f(anio, 7, 20), nombre: 'Día de la Independencia' },
    { fecha: f(anio, 8, 7), nombre: 'Batalla de Boyacá' },
    { fecha: aLunes(f(anio, 8, 15)), nombre: 'Asunción de la Virgen' },
    { fecha: aLunes(f(anio, 10, 12)), nombre: 'Día de la Raza' },
    { fecha: aLunes(f(anio, 11, 1)), nombre: 'Todos los Santos' },
    { fecha: aLunes(f(anio, 11, 11)), nombre: 'Independencia de Cartagena' },
    { fecha: f(anio, 12, 8), nombre: 'Inmaculada Concepción' },
    { fecha: f(anio, 12, 25), nombre: 'Navidad' },
  ];
  if (anio >= 2026) {
    // PENDIENTE: confirmar si la Ley 2578/2026 lo fija o lo traslada al lunes.
    lista.push({ fecha: f(anio, 7, 9), nombre: 'Festivo 9 de julio (Ley 2578/2026)' });
  }
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha));
}

export function festivosDelAnio(anio: number, ajustes: AjusteFestivo[] = []): Festivo[] {
  const mapa = new Map(festivosBase(anio).map((x) => [x.fecha, x]));
  for (const aj of ajustes) {
    if (!aj.fecha.startsWith(`${anio}-`)) continue;
    if (aj.tipo === 'QUITAR') mapa.delete(aj.fecha);
    else mapa.set(aj.fecha, { fecha: aj.fecha, nombre: aj.nombre ?? 'Festivo' });
  }
  return [...mapa.values()].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/** Calendario con caché por año, para consultas repetidas del motor. */
export class Calendario {
  private cache = new Map<number, Set<FechaLocal>>();
  constructor(private readonly ajustes: AjusteFestivo[] = []) {}

  esFestivo(fecha: FechaLocal): boolean {
    const anio = Number(fecha.slice(0, 4));
    let set = this.cache.get(anio);
    if (!set) {
      set = new Set(festivosDelAnio(anio, this.ajustes).map((x) => x.fecha));
      this.cache.set(anio, set);
    }
    return set.has(fecha);
  }

  esDominicalOFestivo(fecha: FechaLocal): boolean {
    return diaSemanaDeFecha(fecha) === 0 || this.esFestivo(fecha);
  }
}
