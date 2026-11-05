import { fechaLocal } from '@inout/core';
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect, useRef } from 'react';

/** Fecha de hoy en Colombia (no la del equipo del supervisor). */
export const hoyColombia = () => fechaLocal(new Date());

export const pesos = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

/** Minutos → "h:mm". */
export const horas = (min: number) => (min ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}` : '—');

export function Boton({ variante = 'secundario', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'peligro' }) {
  const estilos = {
    primario: 'bg-slate-900 text-white hover:bg-slate-700',
    secundario: 'border border-slate-300 bg-white hover:bg-slate-100',
    peligro: 'bg-rose-600 text-white hover:bg-rose-500',
  }[variante];
  return <button type="button" className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${estilos} ${className}`} {...p} />;
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{etiqueta}</span>
      {children}
    </label>
  );
}

const claseInput = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';
export const Entrada = (p: InputHTMLAttributes<HTMLInputElement>) => <input className={claseInput} {...p} />;
export const Selector = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select className={claseInput} {...p} />;

export function MensajeError({ error }: { error: Error | null | undefined }) {
  return error ? <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error.message}</p> : null;
}

export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} onClose={onCerrar} className="m-auto w-full max-w-lg rounded-xl p-0 shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <button type="button" onClick={onCerrar} className="text-xl text-slate-400 hover:text-slate-700" aria-label="Cerrar">
          ×
        </button>
      </div>
      <div className="flex flex-col gap-3 p-5">{children}</div>
    </dialog>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-slate-500 [&_thead]:bg-slate-50 [&_tr]:border-b">
        {children}
      </table>
    </div>
  );
}

const coloresEstado: Record<string, string> = {
  ABIERTA: 'bg-emerald-100 text-emerald-800',
  CERRADA: 'bg-slate-100 text-slate-700',
  REVISION: 'bg-amber-100 text-amber-800',
  ANULADA: 'bg-rose-100 text-rose-700 line-through',
};
export const Estado = ({ estado }: { estado: string }) => (
  <span className={`rounded px-2 py-0.5 text-xs font-medium ${coloresEstado[estado] ?? ''}`}>{estado}</span>
);

export const Vacio = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed p-6 text-center text-slate-500">{children}</p>;
