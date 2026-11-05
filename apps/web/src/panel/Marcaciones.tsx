import { sumarDias } from '@inout/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { EditorMarcacion } from './EditorMarcacion';
import type { Empleado, Marcacion } from './tipos';
import { Boton, Campo, Entrada, Estado, MensajeError, Selector, Tabla, Vacio, hoyColombia } from './ui';

function duracion(m: Marcacion) {
  if (!m.salida) return '—';
  const min = Math.round((Date.parse(m.salida.iso) - Date.parse(m.entrada.iso)) / 60_000);
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

function TablaMarcaciones({ filas, onEditar, mostrarEmpleado = true }: { filas: Marcacion[]; onEditar: (m: Marcacion) => void; mostrarEmpleado?: boolean }) {
  return (
    <Tabla>
      <thead>
        <tr>
          <th>N.º</th>
          {mostrarEmpleado && <th>Empleado</th>}
          <th>Entrada</th>
          <th>Salida</th>
          <th>Duración</th>
          <th>Estado</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {filas.map((m) => (
          <tr key={m.id}>
            <td className="text-slate-400">{m.id}</td>
            {mostrarEmpleado && <td>{m.empleado}</td>}
            <td className="tabular-nums">
              {m.entrada.fecha} {m.entrada.hora}
            </td>
            <td className="tabular-nums">{m.salida ? `${m.salida.fecha} ${m.salida.hora}` : '—'}</td>
            <td>{duracion(m)}</td>
            <td>
              <Estado estado={m.estado} />
            </td>
            <td className="text-right">
              {m.estado !== 'ANULADA' && <Boton onClick={() => onEditar(m)}>Corregir</Boton>}
            </td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** Bandeja de turnos sin salida que superaron el máximo y necesitan corrección. */
export function Revision() {
  const [editando, setEditando] = useState<Marcacion>();
  const q = useQuery({ queryKey: ['revision'], queryFn: () => api<Marcacion[]>('/marcaciones/revision') });
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Turnos sin salida que superaron el máximo permitido. El sistema no inventa la hora de salida: escríbela con el motivo, o anula la marcación.
      </p>
      <MensajeError error={q.error} />
      {q.data && (q.data.length ? <TablaMarcaciones filas={q.data} onEditar={setEditando} /> : <Vacio>No hay marcaciones en revisión.</Vacio>)}
      {editando && <EditorMarcacion marcacion={editando} onCerrar={() => setEditando(undefined)} />}
    </section>
  );
}

export function Marcaciones() {
  const [desde, setDesde] = useState(() => sumarDias(hoyColombia(), -6));
  const [hasta, setHasta] = useState(hoyColombia);
  const [empleadoId, setEmpleadoId] = useState('');
  const [estado, setEstado] = useState('');
  const [editando, setEditando] = useState<Marcacion | 'nueva'>();

  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados') });
  const params = new URLSearchParams({ desde, hasta, ...(empleadoId && { empleadoId }), ...(estado && { estado }) });
  const q = useQuery({ queryKey: ['marcaciones', params.toString()], queryFn: () => api<Marcacion[]>(`/marcaciones?${params}`) });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde">
          <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Campo>
        <Campo etiqueta="Empleado">
          <Selector value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
            <option value="">Todos</option>
            {empleados.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Estado">
          <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {['ABIERTA', 'CERRADA', 'REVISION', 'ANULADA'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Selector>
        </Campo>
        <Boton variante="primario" className="ml-auto" onClick={() => setEditando('nueva')}>
          Nueva marcación manual
        </Boton>
      </div>
      <MensajeError error={q.error} />
      {q.data && (q.data.length ? <TablaMarcaciones filas={q.data} onEditar={setEditando} /> : <Vacio>Sin marcaciones en el periodo.</Vacio>)}
      {editando && <EditorMarcacion marcacion={editando === 'nueva' ? undefined : editando} onCerrar={() => setEditando(undefined)} />}
    </section>
  );
}
