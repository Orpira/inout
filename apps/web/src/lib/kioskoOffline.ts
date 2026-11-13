/**
 * Almacenamiento local del kiosko para trabajar sin conexión.
 *
 * - Cola de marcaciones capturadas sin red, cada una con un UUID para que el servidor
 *   pueda descartar reenvíos (idempotencia).
 * - Directorio de empleados activos (código, nombre y si tienen un turno abierto) para
 *   validar el código y saber si toca entrada o salida mientras no hay servidor.
 */
import { api, ErrorApi } from "./api";

export interface MarcaPendiente {
  id: string;
  codigo: string;
  capturadoEn: string;
}

export interface EmpleadoDirectorio {
  identificacion: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  abiertaDesde: string | null;
  /** Hora con la que el sistema cerraría el turno abierto (null = desconocida o sin referencia). */
  salidaProgramada?: string | null;
}

interface Directorio {
  generadoEn: string | null;
  maxHorasTurno?: number;
  deshabilitado?: boolean;
  empleados: Record<string, EmpleadoDirectorio>;
}

const K_COLA = "inout.kioskoCola";
const K_DIR = "inout.kioskoDirectorio";
const K_DISPOSITIVO = "inout.kioskoDispositivo";

function leer<T>(clave: string, defecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}
function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o no disponible */
  }
}

/** UUID v4. crypto.randomUUID solo existe en contextos seguros (HTTPS), así que hay respaldo. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nombreDispositivo(): string {
  let n = leer<string | null>(K_DISPOSITIVO, null);
  if (!n) {
    n = `Kiosko ${uuid().slice(0, 4).toUpperCase()}`;
    escribir(K_DISPOSITIVO, n);
  }
  return n;
}

/* ---------- Cola ---------- */

export function cola(): MarcaPendiente[] {
  // Las marcas de versiones anteriores no tenían id: se les asigna uno.
  const c = leer<Array<Partial<MarcaPendiente>>>(K_COLA, []);
  let cambio = false;
  const normal = c
    .filter((m) => m.codigo && m.capturadoEn)
    .map((m) => {
      if (m.id) return m as MarcaPendiente;
      cambio = true;
      return { ...m, id: uuid() } as MarcaPendiente;
    });
  if (cambio) escribir(K_COLA, normal);
  return normal;
}

/** Guarda una marcación en la tablet y actualiza el estado local del empleado. */
export function encolar(codigo: string, momento = new Date()): { marca: MarcaPendiente; tipo: "ENTRADA" | "SALIDA" | null } {
  const marca = { id: uuid(), codigo, capturadoEn: momento.toISOString() };
  escribir(K_COLA, [...cola(), marca]);
  const tipo = alternarEstadoLocal(codigo, momento);
  return { marca, tipo };
}

export interface ResumenSincronizacion {
  enviadas: number;
  rechazadas: number;
}

let sincronizando: Promise<ResumenSincronizacion> | null = null;

/** Envía la cola al servidor en lotes. Solo se borra de la tablet lo que el servidor confirmó haber recibido. */
export function sincronizar(): Promise<ResumenSincronizacion> {
  sincronizando ??= (async () => {
    const resumen = { enviadas: 0, rechazadas: 0 };
    try {
      for (;;) {
        const lote = cola().slice(0, 200);
        if (!lote.length) break;
        const r = await api<{ resultados: { id: string; estado: string }[] }>("/kiosko/sincronizar", {
          body: { enviadoEn: new Date().toISOString(), dispositivo: nombreDispositivo(), marcas: lote },
          timeoutMs: 15000,
        });
        const recibidas = new Set(r.resultados.map((x) => x.id));
        resumen.enviadas += r.resultados.filter((x) => x.estado === "APLICADA").length;
        resumen.rechazadas += r.resultados.filter((x) => x.estado === "RECHAZADA").length;
        escribir(K_COLA, cola().filter((m) => !recibidas.has(m.id)));
        if (recibidas.size < lote.length) break;
      }
    } catch (e) {
      if (!(e instanceof ErrorApi)) throw e; // sin red o error del servidor: se reintenta luego
    }
    return resumen;
  })().finally(() => {
    sincronizando = null;
  });
  return sincronizando;
}

/* ---------- Directorio ---------- */

function directorio(): Directorio {
  return leer<Directorio>(K_DIR, { generadoEn: null, empleados: {} });
}

export const directorioDisponible = () => {
  const d = directorio();
  return !d.deshabilitado && d.generadoEn !== null;
};

export async function actualizarDirectorio(): Promise<void> {
  try {
    const r = await api<{ generadoEn: string; maxHorasTurno?: number; empleados: EmpleadoDirectorio[] }>("/kiosko/directorio", { timeoutMs: 15000 });
    const pendientes = cola();
    const empleados = Object.fromEntries(r.empleados.map((e) => [e.identificacion, e]));
    escribir(K_DIR, { generadoEn: r.generadoEn, maxHorasTurno: r.maxHorasTurno, empleados });
    // Reaplica sobre el directorio las marcas que aún no llegaron al servidor.
    for (const m of pendientes) alternarEstadoLocal(m.codigo, new Date(m.capturadoEn));
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === "DIRECTORIO_DESHABILITADO") {
      escribir(K_DIR, { generadoEn: null, deshabilitado: true, empleados: {} });
    }
  }
}

export function buscarEnDirectorio(codigo: string): EmpleadoDirectorio | null {
  return directorio().empleados[codigo] ?? null;
}

/** Horas sin salida tras las cuales el sistema da el turno por cerrado (lo informa el servidor; 16 por defecto). */
export const maxHorasTurno = () => directorio().maxHorasTurno ?? 16;

function alternarEstadoLocal(codigo: string, momento: Date): "ENTRADA" | "SALIDA" | null {
  const d = directorio();
  const e = d.empleados[codigo];
  if (!e) return null;
  const vencida = !!e.abiertaDesde && momento.getTime() - new Date(e.abiertaDesde).getTime() > (d.maxHorasTurno ?? 16) * 3_600_000;
  const tipo = e.abiertaDesde && !vencida ? "SALIDA" : "ENTRADA";
  e.abiertaDesde = tipo === "ENTRADA" ? momento.toISOString() : null;
  e.salidaProgramada = null;
  escribir(K_DIR, d);
  return tipo;
}

/** Tras una marcación confirmada por el servidor, deja el directorio local en el mismo estado. */
export function registrarEstadoLocal(codigo: string, tipo: "ENTRADA" | "SALIDA", momento: string) {
  const d = directorio();
  const e = d.empleados[codigo];
  if (!e) return;
  e.abiertaDesde = tipo === "ENTRADA" ? momento : null;
  e.salidaProgramada = null;
  escribir(K_DIR, d);
}
