import { formatearLocal } from '@inout/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type RespuestaMarcacion, api } from './api';

/** Reloj siempre en hora de Colombia, aunque el equipo tenga otra zona configurada. */
function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-center">
      <div className="text-7xl font-bold tabular-nums">
        {formatearLocal(ahora, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </div>
      <div className="mt-2 text-xl capitalize text-slate-500">
        {formatearLocal(ahora, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <div className="text-sm text-slate-400">Hora de Colombia</div>
    </div>
  );
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok'] as const;

export function Kiosko() {
  const [documento, setDocumento] = useState('');
  const marcar = useMutation({
    mutationFn: (doc: string) =>
      api<RespuestaMarcacion>('/kiosko/marcar', { method: 'POST', body: JSON.stringify({ documento: doc }) }),
    onSettled: () => setDocumento(''),
  });

  // El mensaje se borra solo para dejar el kiosko listo para la siguiente persona.
  const { status, reset } = marcar;
  useEffect(() => {
    if (status !== 'success' && status !== 'error') return;
    const id = setTimeout(reset, 5000);
    return () => clearTimeout(id);
  }, [status, reset]);

  const pulsar = (t: (typeof TECLAS)[number]) => {
    if (t === 'borrar') setDocumento((d) => d.slice(0, -1));
    else if (t === 'ok') documento.length >= 3 && marcar.mutate(documento);
    else setDocumento((d) => (d.length < 20 ? d + t : d));
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 select-none">
      <Reloj />

      <div className="h-24 w-full max-w-md text-center">
        {marcar.isSuccess && (
          <div className={`rounded-xl p-4 text-white ${marcar.data.tipo === 'ENTRADA' ? 'bg-emerald-600' : 'bg-sky-600'}`}>
            <div className="text-2xl font-semibold">
              {marcar.data.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} · {marcar.data.hora}
            </div>
            <div>{marcar.data.empleado}</div>
            {marcar.data.aviso && <div className="mt-1 text-sm">{marcar.data.aviso}</div>}
          </div>
        )}
        {marcar.isError && <div className="rounded-xl bg-rose-600 p-4 text-xl text-white">{marcar.error.message}</div>}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-4 h-16 rounded-xl border-2 border-slate-300 bg-white text-center text-4xl leading-15 tracking-widest">
          {documento || <span className="text-2xl text-slate-400">Número de documento</span>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TECLAS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={marcar.isPending}
              onClick={() => pulsar(t)}
              className={`h-20 rounded-xl text-3xl font-semibold shadow active:scale-95 disabled:opacity-50 ${
                t === 'ok' ? 'bg-emerald-600 text-white' : t === 'borrar' ? 'bg-slate-200 text-xl' : 'bg-white'
              }`}
            >
              {t === 'ok' ? 'Marcar' : t === 'borrar' ? 'Borrar' : t}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
