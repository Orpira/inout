import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorApi, type Sesion, api } from './api';

function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const login = useMutation({
    mutationFn: () => api<Sesion>('/auth/login', { method: 'POST', body: JSON.stringify({ email, clave }) }),
    onSuccess: (s) => qc.setQueryData(['sesion'], s),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <form onSubmit={enviar} className="mx-auto mt-24 flex max-w-sm flex-col gap-3 rounded-xl bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Panel de supervisión</h1>
      <input className="rounded border p-2" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border p-2" type="password" placeholder="Clave" value={clave} onChange={(e) => setClave(e.target.value)} required />
      {login.isError && <p className="text-sm text-rose-600">{login.error.message}</p>}
      <button className="rounded bg-slate-900 p-2 text-white disabled:opacity-50" disabled={login.isPending}>
        Entrar
      </button>
    </form>
  );
}

export function Panel() {
  const qc = useQueryClient();
  const sesion = useQuery({
    queryKey: ['sesion'],
    queryFn: () => api<Sesion>('/auth/yo'),
    retry: (n, err) => !(err instanceof ErrorApi && err.status === 401) && n < 2,
  });
  const salir = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.setQueryData(['sesion'], null),
  });

  if (sesion.isPending) return null;
  if (!sesion.data) return <Login />;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">InOut · Supervisión</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {sesion.data.nombre} ({sesion.data.rol})
          </span>
          <button className="rounded border px-3 py-1" onClick={() => salir.mutate()}>
            Salir
          </button>
        </div>
      </header>
      <p className="text-slate-500">Pendiente: marcaciones en revisión, correcciones con motivo, liquidación y calendario de festivos.</p>
    </div>
  );
}
