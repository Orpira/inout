import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { type Sesion, api } from './api';
import { Empleados } from './panel/Empleados';
import { Festivos } from './panel/Festivos';
import { Liquidacion } from './panel/Liquidacion';
import { Marcaciones, Revision } from './panel/Marcaciones';
import { Turnos } from './panel/Turnos';
import { Usuarios } from './panel/Usuarios';

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
    queryFn: async () => (await api<{ sesion: Sesion | null }>('/auth/yo')).sesion,
  });
  const salir = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear(); // no dejar datos de la sesión anterior en caché
      qc.setQueryData(['sesion'], null);
    },
  });

  if (sesion.isPending) return null;
  if (!sesion.data) return <Login />;
  return <Principal sesion={sesion.data} onSalir={() => salir.mutate()} />;
}

const PESTANAS = [
  { id: 'revision', titulo: 'Revisión', soloAdmin: false },
  { id: 'marcaciones', titulo: 'Marcaciones', soloAdmin: false },
  { id: 'turnos', titulo: 'Turnos', soloAdmin: false },
  { id: 'liquidacion', titulo: 'Liquidación', soloAdmin: false },
  { id: 'empleados', titulo: 'Empleados', soloAdmin: true },
  { id: 'festivos', titulo: 'Festivos', soloAdmin: false },
  { id: 'usuarios', titulo: 'Usuarios', soloAdmin: true },
] as const;
type IdPestana = (typeof PESTANAS)[number]['id'];

function Principal({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esAdmin = sesion.rol === 'ADMIN';
  const visibles = PESTANAS.filter((p) => esAdmin || !p.soloAdmin);
  // La pestaña va en el hash para que sobreviva a una recarga.
  const inicial = visibles.find((p) => `#${p.id}` === window.location.hash)?.id ?? 'revision';
  const [activa, setActiva] = useState<IdPestana>(inicial);
  const ir = (id: IdPestana) => {
    setActiva(id);
    history.replaceState(null, '', `#${id}`);
  };
  const revision = useQuery({ queryKey: ['revision'], queryFn: () => api<unknown[]>('/marcaciones/revision'), refetchInterval: 60_000 });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">InOut · Supervisión</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">Hora de Colombia</span>
          <span>
            {sesion.nombre} · {esAdmin ? 'Administrador' : 'Supervisor'}
          </span>
          <button className="rounded border px-3 py-1" onClick={onSalir}>
            Salir
          </button>
        </div>
      </header>
      <nav className="mb-6 flex gap-1 border-b">
        {visibles.map((p) => (
          <button
            key={p.id}
            onClick={() => ir(p.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${activa === p.id ? 'border-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {p.titulo}
            {p.id === 'revision' && !!revision.data?.length && (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{revision.data.length}</span>
            )}
          </button>
        ))}
      </nav>
      {activa === 'revision' && <Revision />}
      {activa === 'marcaciones' && <Marcaciones />}
      {activa === 'turnos' && <Turnos esAdmin={esAdmin} />}
      {activa === 'liquidacion' && <Liquidacion />}
      {activa === 'empleados' && esAdmin && <Empleados />}
      {activa === 'festivos' && <Festivos puedeEditar={esAdmin} />}
      {activa === 'usuarios' && esAdmin && <Usuarios />}
    </div>
  );
}
