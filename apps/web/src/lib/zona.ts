import { esZonaValida, establecerZona, zonaHoraria } from "@inout/core";
import { useSyncExternalStore } from "react";

/**
 * Zona horaria de la instalación en el navegador. La API la envía en la cabecera
 * x-zona-horaria de cada respuesta; se guarda en el dispositivo para que el kiosko
 * la conserve aunque se abra sin conexión.
 */
const CLAVE = "inout.zonaHoraria";
const oyentes = new Set<() => void>();

/** Aplica la última zona conocida antes de pintar la aplicación. */
export function iniciarZona() {
  try {
    const z = localStorage.getItem(CLAVE);
    if (z && esZonaValida(z)) establecerZona(z);
  } catch {
    /* almacenamiento no disponible: se queda la zona predeterminada */
  }
}

export function aplicarZona(zona: string | null | undefined) {
  if (!zona || zona === zonaHoraria() || !esZonaValida(zona)) return;
  establecerZona(zona);
  try {
    localStorage.setItem(CLAVE, zona);
  } catch {
    /* sin almacenamiento local */
  }
  oyentes.forEach((f) => f());
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

export const useZona = () => useSyncExternalStore(suscribir, zonaHoraria);

export const ZONAS_SUGERIDAS: { zona: string; nombre: string }[] = [
  { zona: "America/Bogota", nombre: "Colombia (Bogotá)" },
  { zona: "Europe/Madrid", nombre: "España peninsular (Madrid)" },
  { zona: "Atlantic/Canary", nombre: "España, Canarias" },
  { zona: "America/Mexico_City", nombre: "México (Ciudad de México)" },
  { zona: "America/Lima", nombre: "Perú (Lima)" },
  { zona: "America/Guayaquil", nombre: "Ecuador (Guayaquil)" },
  { zona: "America/Panama", nombre: "Panamá" },
  { zona: "America/Caracas", nombre: "Venezuela (Caracas)" },
  { zona: "America/Santiago", nombre: "Chile (Santiago)" },
  { zona: "America/Argentina/Buenos_Aires", nombre: "Argentina (Buenos Aires)" },
  { zona: "America/New_York", nombre: "Estados Unidos (Nueva York)" },
  { zona: "UTC", nombre: "UTC" },
];

export const nombreZona = (zona: string) => ZONAS_SUGERIDAS.find((z) => z.zona === zona)?.nombre ?? zona.replace(/_/g, " ");

/** Todas las zonas IANA que conoce el navegador (si lo permite). */
export function todasLasZonas(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/** Desfase respecto a UTC, p. ej. "UTC−05:00" o "UTC+01:00". */
export function textoDesfase(zona: string, fecha = new Date()): string {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: zona, timeZoneName: "longOffset" }).formatToParts(fecha);
    const t = p.find((x) => x.type === "timeZoneName")?.value ?? "GMT";
    return t === "GMT" ? "UTC±00:00" : t.replace("GMT", "UTC").replace("-", "−");
  } catch {
    return "";
  }
}
