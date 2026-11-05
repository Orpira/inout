/**
 * Festivos nacionales de Colombia.
 *
 * - Ley 51 de 1983 (Ley Emiliani): varios festivos se trasladan al lunes siguiente.
 * - Festivos ligados a la Pascua (Semana Santa, Ascensión, Corpus Christi, Sagrado Corazón).
 * - Ley 2578 de 2026: 9 de julio (Nuestra Señora del Rosario de Chiquinquirá), con traslado Emiliani,
 *   aplicable desde 2026.
 *
 * El calendario admite ajustes manuales (agregar o quitar fechas) para cubrir cambios
 * normativos o decisiones de la Corte sin tocar código.
 */
import { diaSemana, sumarDias } from "./fechas.js";

export interface Festivo {
  fecha: string;
  nombre: string;
  trasladado?: boolean;
}

export interface AjusteFestivo {
  fecha: string;
  tipo: "AGREGAR" | "QUITAR";
  descripcion?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Domingo de Pascua (algoritmo gregoriano anónimo / Meeus-Jones-Butcher). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

/** Traslada una fecha al lunes siguiente si no cae en lunes (Ley Emiliani). */
export function siguienteLunes(fecha: string): string {
  const ds = diaSemana(fecha);
  if (ds === 1) return fecha;
  const dias = ds === 0 ? 1 : 8 - ds;
  return sumarDias(fecha, dias);
}

export function festivosColombia(anio: number): Festivo[] {
  const f = (md: string) => `${anio}-${md}`;
  const lista: Festivo[] = [];

  // Fijos (no se trasladan)
  lista.push({ fecha: f("01-01"), nombre: "Año Nuevo" });
  lista.push({ fecha: f("05-01"), nombre: "Día del Trabajo" });
  lista.push({ fecha: f("07-20"), nombre: "Día de la Independencia" });
  lista.push({ fecha: f("08-07"), nombre: "Batalla de Boyacá" });
  lista.push({ fecha: f("12-08"), nombre: "Inmaculada Concepción" });
  lista.push({ fecha: f("12-25"), nombre: "Navidad" });

  // Ley Emiliani: se trasladan al lunes siguiente
  const emiliani: Array<[string, string]> = [
    ["01-06", "Reyes Magos"],
    ["03-19", "San José"],
    ["06-29", "San Pedro y San Pablo"],
    ["08-15", "Asunción de la Virgen"],
    ["10-12", "Día de la Raza"],
    ["11-01", "Todos los Santos"],
    ["11-11", "Independencia de Cartagena"],
  ];
  if (anio >= 2026) emiliani.push(["07-09", "Virgen del Rosario de Chiquinquirá"]);
  for (const [md, nombre] of emiliani) {
    const original = f(md);
    const fecha = siguienteLunes(original);
    lista.push({ fecha, nombre, trasladado: fecha !== original });
  }

  // Ligados a la Pascua
  const pascua = domingoDePascua(anio);
  lista.push({ fecha: sumarDias(pascua, -3), nombre: "Jueves Santo" });
  lista.push({ fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" });
  lista.push({ fecha: sumarDias(pascua, 43), nombre: "Ascensión del Señor", trasladado: true });
  lista.push({ fecha: sumarDias(pascua, 64), nombre: "Corpus Christi", trasladado: true });
  lista.push({ fecha: sumarDias(pascua, 71), nombre: "Sagrado Corazón", trasladado: true });

  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface CalendarioFestivos {
  esFestivo(fecha: string): boolean;
  nombre(fecha: string): string | undefined;
  delAnio(anio: number): Festivo[];
}

/** Crea un calendario con ajustes manuales aplicados encima de los festivos legales. */
export function crearCalendario(ajustes: AjusteFestivo[] = []): CalendarioFestivos {
  const cache = new Map<number, Map<string, string>>();

  const mapaAnio = (anio: number) => {
    let m = cache.get(anio);
    if (!m) {
      m = new Map(festivosColombia(anio).map((x) => [x.fecha, x.nombre]));
      for (const a of ajustes) {
        if (!a.fecha.startsWith(`${anio}-`)) continue;
        if (a.tipo === "AGREGAR") m.set(a.fecha, a.descripcion || "Festivo adicional");
        else m.delete(a.fecha);
      }
      cache.set(anio, m);
    }
    return m;
  };

  return {
    esFestivo: (fecha) => mapaAnio(Number(fecha.slice(0, 4))).has(fecha),
    nombre: (fecha) => mapaAnio(Number(fecha.slice(0, 4))).get(fecha),
    delAnio: (anio) =>
      [...mapaAnio(anio).entries()]
        .map(([fecha, nombre]) => ({ fecha, nombre }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}
