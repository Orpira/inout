import { aHoraLocal, fechaLocal } from "@inout/core";

const ZONA = "America/Bogota";

const fmtHora = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtFechaCorta = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
const fmtFechaLarga = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtPesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export const hora = (iso: string | Date) => fmtHora.format(new Date(iso));
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const fechaCorta = (iso: string | Date) => mayuscula(fmtFechaCorta.format(new Date(iso)).replace(/\.$/, ""));
export const fechaLarga = (iso: string | Date) => mayuscula(fmtFechaLarga.format(new Date(iso)));
export const pesos = (v: number | null | undefined) => (v == null ? "—" : fmtPesos.format(v));

/** Fecha YYYY-MM-DD en texto corto, sin depender de la zona del navegador. */
export const fechaISOCorta = (f: string) => fechaCorta(`${f}T12:00:00-05:00`);

export function duracion(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export const horasDecimales = (min: number) => (min / 60).toLocaleString("es-CO", { maximumFractionDigits: 1 });

export const hoyLocal = () => fechaLocal(new Date());
export const inicioMes = () => `${hoyLocal().slice(0, 7)}-01`;

/** Convierte un instante ISO a valor de <input type="datetime-local"> en hora de Colombia. */
export function aInputLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const l = aHoraLocal(new Date(iso));
  return `${l.fecha}T${String(l.hora).padStart(2, "0")}:${String(l.minuto).padStart(2, "0")}`;
}

/** Interpreta un valor de <input type="datetime-local"> como hora de Colombia. */
export function desdeInputLocal(valor: string): string | null {
  if (!valor) return null;
  return new Date(`${valor}:00-05:00`).toISOString();
}

export const nombreCompleto = (e: { nombre: string; apellido: string }) => `${e.nombre} ${e.apellido}`.trim();
