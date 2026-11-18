import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { DatosEmpresa } from "./tipos";

/** Empresa y sucursales (centros de costo). Una API anterior sin esta ruta devuelve listas vacías. */
export function useEmpresa() {
  return useQuery({
    queryKey: ["empresa"],
    queryFn: () => api<DatosEmpresa>("/empresa"),
    retry: false,
    staleTime: 60_000,
  });
}

export const etiquetaSucursal = (s: { codigo: string; nombre: string }) => `${s.nombre} (${s.codigo})`;
