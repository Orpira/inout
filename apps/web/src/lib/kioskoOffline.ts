/**
 * Almacenamiento local del kiosko para trabajar sin conexión.
 *
 * - Cola de marcaciones capturadas sin red, cada una con un UUID para que el servidor
 *   pueda descartar reenvíos (idempotencia).
 * - Directorio de empleados activos (código, nombre y si tienen un turno abierto) para
 *   validar el código y saber si toca entrada o salida mientras no hay servidor.
 */
import { api, ErrorApi } from "./api";

/** Dónde y con qué turno se marca. */
export interface ContextoMarca {
  sucursalId?: number | null;
  /** Turno elegido al marcar la entrada en una sucursal que no es la del empleado (null = su horario habitual). */
  turno?: { horarioId: number | null } | null;
  ubicacion?: { latitud: number; longitud: number; precisionMetros?: number | null } | null;
}

export interface MarcaPendiente extends ContextoMarca {
  id: string;
  codigo: string;
  capturadoEn: string;
}

export interface OpcionTurno {
  horarioId: number | null;
  nombre: string;
  habitual: boolean;
}

/** Sucursal a la que está asociado este kiosko. */
export interface SucursalKiosko {
  id: number;
  nombre: string;
}

export interface EmpleadoDirectorio {
  identificacion: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  abiertaDesde: string | null;
  /** Hora con la que el sistema cerraría el turno abierto (null = desconocida o sin referencia). */
  salidaProgramada?: string | null;
  sucursalId?: number | null;
  horarioId?: number | null;
}

interface Directorio {
  generadoEn: string | null;
  maxHorasTurno?: number;
  turnos?: { id: number; nombre: string; sucursalId: number | null }[];
  sucursales?: { id: number; nombre: string }[];
  deshabilitado?: boolean;
  empleados: Record<string, EmpleadoDirectorio>;
}

const K_COLA = "inout.kioskoCola";
const K_DIR = "inout.kioskoDirectorio";
const K_DISPOSITIVO = "inout.kioskoDispositivo";
const K_SUCURSAL = "inout.kioskoSucursal";

export const sucursalKiosko = () => leer<SucursalKiosko | null>(K_SUCURSAL, null);
export const fijarSucursalKiosko = (s: SucursalKiosko | null) => {
  if (s) escribir(K_SUCURSAL, s);
  else {
    try {
      localStorage.removeItem(K_SUCURSAL);
    } catch {
      /* sin almacenamiento */
    }
  }
};

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
export function encolar(codigo: string, momento = new Date(), contexto: ContextoMarca = {}): { marca: MarcaPendiente; tipo: "ENTRADA" | "SALIDA" | null } {
  const marca: MarcaPendiente = { id: uuid(), codigo, capturadoEn: momento.toISOString(), ...contexto };
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
    const r = await api<{ generadoEn: string; maxHorasTurno?: number; turnos?: Directorio["turnos"]; sucursales?: Directorio["sucursales"]; empleados: EmpleadoDirectorio[] }>(
      "/kiosko/directorio",
      { timeoutMs: 15000 },
    );
    const pendientes = cola();
    const empleados = Object.fromEntries(r.empleados.map((e) => [e.identificacion, e]));
    escribir(K_DIR, { generadoEn: r.generadoEn, maxHorasTurno: r.maxHorasTurno, turnos: r.turnos, sucursales: r.sucursales, empleados });
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

/** Si la marcación local sería una entrada (según lo guardado en la tablet). */
export function tocaEntradaLocal(e: EmpleadoDirectorio, momento = new Date()) {
  return !e.abiertaDesde || momento.getTime() - new Date(e.abiertaDesde).getTime() > maxHorasTurno() * 3_600_000;
}

/**
 * Sin conexión: si el empleado entra en una sucursal que no es la suya, los turnos que puede elegir
 * (los de esa sucursal o, si no tiene, los generales, más su horario habitual). Igual que el servidor.
 */
export function opcionesTurnoLocal(e: EmpleadoDirectorio, sucursalId: number): { sucursalBase: string | null; opciones: OpcionTurno[] } | null {
  if (!e.sucursalId || e.sucursalId === sucursalId) return null;
  const d = directorio();
  if (!d.turnos) return null; // directorio de una API anterior
  const propios = d.turnos.filter((t) => t.sucursalId === sucursalId);
  const candidatos = (propios.length ? propios : d.turnos.filter((t) => t.sucursalId === null)).filter((t) => t.id !== e.horarioId);
  const habitual = e.horarioId ? d.turnos.find((t) => t.id === e.horarioId) : null;
  return {
    sucursalBase: d.sucursales?.find((s) => s.id === e.sucursalId)?.nombre ?? null,
    opciones: [
      ...candidatos.map((t) => ({ horarioId: t.id, nombre: t.nombre, habitual: false })),
      { horarioId: null, nombre: habitual ? `Mi turno habitual (${habitual.nombre})` : "Mi turno habitual (jornada legal)", habitual: true },
    ],
  };
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
