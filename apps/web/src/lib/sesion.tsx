import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "./api";
import type { Usuario } from "./tipos";

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (email: string, password: string) => Promise<void>;
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
    entrar: async (email, password) => {
      const r = await api<{ usuario: Usuario }>("/auth/login", { body: { email, password } });
      qc.setQueryData(["me"], r.usuario);
    },
    salir: async () => {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
