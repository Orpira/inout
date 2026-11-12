import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "./api";
import type { Usuario } from "./tipos";

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  /** `antesDeEntrar` se ejecuta con la sesión ya abierta en el servidor, antes de mostrar el panel. */
  entrar: (email: string, password: string, antesDeEntrar?: (u: Usuario) => Promise<void>) => Promise<Usuario>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ usuario: Usuario }>("/auth/me").then((r) => r.usuario).catch(() => null),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const expirada = () => qc.setQueryData(["me"], null);
    window.addEventListener("inout:sesion-expirada", expirada);
    return () => window.removeEventListener("inout:sesion-expirada", expirada);
  }, [qc]);

  const valor: Sesion = {
    usuario: me.data ?? null,
    cargando: me.isPending,
    entrar: async (email, password, antesDeEntrar) => {
      const r = await api<{ usuario: Usuario }>("/auth/login", { body: { email, password } });
      await antesDeEntrar?.(r.usuario);
      qc.setQueryData(["me"], r.usuario);
      return r.usuario;
    },
    salir: async () => {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
