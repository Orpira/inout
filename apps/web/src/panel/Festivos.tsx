import { diaSemanaDeFecha } from '@inout/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import type { Festivo } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Tabla, hoyColombia } from './ui';

interface Calendario {
  festivos: Festivo[];
  quitados: Festivo[];
  ajustes: { fecha: string; tipo: 'AGREGAR' | 'QUITAR'; nombre: string | null }[];
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

type Accion =
  | { tipo: 'QUITAR'; fecha: string; nombre: string }
  | { tipo: 'RESTAURAR'; fecha: string; nombre: string }
  | { tipo: 'AGREGAR' };

function DialogoAjuste({ accion, onCerrar }: { accion: Accion; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(accion.tipo === 'AGREGAR' ? '' : accion.fecha);
  const [nombre, setNombre] = useState('');
  const [motivo, setMotivo] = useState('');
  const guardar = useMutation({
    mutationFn: () =>
      accion.tipo === 'RESTAURAR'
        ? api(`/festivos/ajustes/${fecha}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
        : api(`/festivos/ajustes/${fecha}`, { method: 'PUT', body: JSON.stringify({ tipo: accion.tipo, nombre: nombre || undefined, motivo }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['festivos'] });
      qc.invalidateQueries({ queryKey: ['liquidacion'] });
      onCerrar();
    },
  });
  const titulos = { QUITAR: 'Quitar festivo', RESTAURAR: 'Restaurar / eliminar ajuste', AGREGAR: 'Agregar festivo' };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };
  return (
    <Modal titulo={titulos[accion.tipo]} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        {accion.tipo === 'AGREGAR' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Fecha">
              <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Nombre">
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </Campo>
          </div>
        ) : (
          <p className="text-sm">
            {accion.fecha} · {accion.nombre}
          </p>
        )}
        <p className="text-xs text-slate-500">Cambia los recargos de todas las liquidaciones que incluyan esta fecha.</p>
        <Campo etiqueta="Motivo (p. ej. decisión de la Corte, decreto)">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
        </Campo>
        <MensajeError error={guardar.error} />
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" type="submit" disabled={guardar.isPending}>
            Confirmar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

export function Festivos({ puedeEditar }: { puedeEditar: boolean }) {
  const [anio, setAnio] = useState(() => Number(hoyColombia().slice(0, 4)));
  const [accion, setAccion] = useState<Accion>();
  const q = useQuery({ queryKey: ['festivos', anio], queryFn: () => api<Calendario>(`/festivos/${anio}`) });
  const agregados = new Set(q.data?.ajustes.filter((a) => a.tipo === 'AGREGAR').map((a) => a.fecha));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Boton onClick={() => setAnio(anio - 1)}>‹</Boton>
        <span className="w-16 text-center text-lg font-semibold">{anio}</span>
        <Boton onClick={() => setAnio(anio + 1)}>›</Boton>
        {puedeEditar && (
          <Boton variante="primario" className="ml-auto" onClick={() => setAccion({ tipo: 'AGREGAR' })}>
            Agregar festivo
          </Boton>
        )}
      </div>
      <MensajeError error={q.error} />
      {q.data && (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Día</th>
              <th>Festivo</th>
              <th>Origen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...q.data.festivos.map((f) => ({ ...f, quitado: false })), ...q.data.quitados.map((f) => ({ ...f, quitado: true }))]
              .sort((a, b) => a.fecha.localeCompare(b.fecha))
              .map((f) => {
                const agregado = agregados.has(f.fecha);
                return (
                  <tr key={f.fecha} className={f.quitado ? '[&>td:not(:last-child)]:text-slate-400 [&>td:not(:last-child)]:line-through' : ''}>
                    <td className="tabular-nums">{f.fecha}</td>
                    <td>{DIAS[diaSemanaDeFecha(f.fecha)]}</td>
                    <td>{f.nombre}</td>
                    <td className="text-xs">{f.quitado ? 'Quitado desde el panel' : agregado ? 'Agregado desde el panel' : 'Ley'}</td>
                    <td className="text-right">
                      {puedeEditar &&
                        (f.quitado || agregado ? (
                          <Boton onClick={() => setAccion({ tipo: 'RESTAURAR', fecha: f.fecha, nombre: f.nombre })}>
                            {f.quitado ? 'Restaurar' : 'Eliminar'}
                          </Boton>
                        ) : (
                          <Boton onClick={() => setAccion({ tipo: 'QUITAR', fecha: f.fecha, nombre: f.nombre })}>Quitar</Boton>
                        ))}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </Tabla>
      )}
      {accion && <DialogoAjuste accion={accion} onCerrar={() => setAccion(undefined)} />}
    </section>
  );
}
