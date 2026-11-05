import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EstadoMarcacion } from "../lib/tipos";

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.65rem] font-bold">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-[65ch] text-tinta-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

const ESTADOS: Record<EstadoMarcacion, { texto: string; clase: string }> = {
  ABIERTA: { texto: "En turno", clase: "bg-petroleo-claro text-petroleo-oscuro" },
  CERRADA: { texto: "Cerrada", clase: "bg-papel text-tinta-suave" },
  REVISION: { texto: "Por revisar", clase: "bg-alerta-claro text-alerta" },
  ANULADA: { texto: "Anulada", clase: "bg-papel text-tinta-tenue line-through" },
};

export function EstadoChip({ estado }: { estado: EstadoMarcacion }) {
  const e = ESTADOS[estado];
  return <span className={`inline-flex rounded px-2 py-0.5 text-[0.8rem] font-semibold ${e.clase}`}>{e.texto}</span>;
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mx-auto mt-1 max-w-[50ch] text-tinta-suave">{children}</div>}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return <div className="px-6 py-10 text-center text-tinta-tenue">{texto}</div>;
}

export function MensajeError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md border border-alerta/30 bg-alerta-claro px-3 py-2 text-[0.92rem] text-alerta">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

/** Panel modal accesible basado en <dialog>. */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho = "max-w-lg",
  lateral = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: string;
  lateral?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => e.target === ref.current && onCerrar()}
      className={
        lateral
          ? `m-0 ml-auto h-dvh max-h-dvh w-full ${ancho} border-l border-linea bg-superficie p-0 backdrop:bg-tinta/30`
          : `m-auto w-[calc(100%-2rem)] ${ancho} rounded-[10px] border border-linea bg-superficie p-0 backdrop:bg-tinta/30`
      }
    >
      {abierto && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-linea px-5 py-3.5">
            <h2 className="text-lg font-bold">{titulo}</h2>
            <button className="btn btn-fantasma h-8 w-8 p-0" onClick={onCerrar} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/* Notificaciones breves */
interface Aviso {
  id: number;
  texto: string;
  tipo: "ok" | "error";
}
const CtxAvisos = createContext<(texto: string, tipo?: Aviso["tipo"]) => void>(() => {});
export const useAviso = () => useContext(CtxAvisos);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <CtxAvisos.Provider value={avisar}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`rounded-md px-4 py-2.5 text-[0.93rem] font-medium text-white shadow-lg ${a.tipo === "ok" ? "bg-tinta" : "bg-alerta"}`}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </CtxAvisos.Provider>
  );
}

export function Paginacion({ pagina, total, porPagina, onCambiar }: { pagina: number; total: number; porPagina: number; onCambiar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-linea px-4 py-3 text-[0.9rem] text-tinta-suave">
      <span>
        {total === 0 ? "Sin resultados" : `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total}`}
      </span>
      <div className="flex gap-2">
        <button className="btn btn-secundario h-8" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          Anterior
        </button>
        <button className="btn btn-secundario h-8" disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
