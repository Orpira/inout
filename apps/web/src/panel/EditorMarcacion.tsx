import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import type { Empleado, Marcacion, RegistroAuditoria } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Selector, hoyColombia } from './ui';

/**
 * Alta manual o corrección de una marcación. Las fechas y horas se escriben y
 * se envían como texto en hora de Colombia; el servidor hace la conversión.
 */
export function EditorMarcacion({ marcacion, onCerrar }: { marcacion?: Marcacion; onCerrar: () => void }) {
  const qc = useQueryClient();
  const esNueva = !marcacion;
  const [empleadoId, setEmpleadoId] = useState('');
  const [fEntrada, setFEntrada] = useState(marcacion?.entrada.fecha ?? hoyColombia());
  const [hEntrada, setHEntrada] = useState(marcacion?.entrada.hora ?? '');
  const [fSalida, setFSalida] = useState(marcacion?.salida?.fecha ?? marcacion?.entrada.fecha ?? hoyColombia());
  const [hSalida, setHSalida] = useState(marcacion?.salida?.hora ?? '');
  const [motivo, setMotivo] = useState('');

  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados'), enabled: esNueva });
  const historial = useQuery({
    queryKey: ['auditoria', 'marcaciones', marcacion?.id],
    queryFn: () => api<RegistroAuditoria[]>(`/auditoria/marcaciones/${marcacion!.id}`),
    enabled: !esNueva,
  });

  const guardar = useMutation({
    mutationFn: (cuerpo: object) =>
      esNueva
        ? api('/marcaciones', { method: 'POST', body: JSON.stringify(cuerpo) })
        : api(`/marcaciones/${marcacion.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) }),
    onSuccess: () => {
      for (const k of ['marcaciones', 'revision', 'liquidacion', 'auditoria']) qc.invalidateQueries({ queryKey: [k] });
      onCerrar();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const entrada = { fecha: fEntrada, hora: hEntrada };
    const salida = hSalida ? { fecha: fSalida, hora: hSalida } : null;
    guardar.mutate(esNueva ? { empleadoId: Number(empleadoId), entrada, salida, motivo } : { entrada, salida, motivo });
  };

  return (
    <Modal titulo={esNueva ? 'Nueva marcación manual' : `Corregir marcación n.º ${marcacion.id} · ${marcacion.empleado ?? ''}`} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        {esNueva && (
          <Campo etiqueta="Empleado">
            <Selector value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {empleados.data
                ?.filter((e) => e.activo)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} · {e.documento}
                  </option>
                ))}
            </Selector>
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha de entrada">
            <Entrada type="date" value={fEntrada} onChange={(e) => setFEntrada(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Hora de entrada">
            <Entrada type="time" value={hEntrada} onChange={(e) => setHEntrada(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Fecha de salida">
            <Entrada type="date" value={fSalida} onChange={(e) => setFSalida(e.target.value)} required={esNueva} />
          </Campo>
          <Campo etiqueta={esNueva ? 'Hora de salida' : 'Hora de salida (vacía = sin salida)'}>
            <Entrada type="time" value={hSalida} onChange={(e) => setHSalida(e.target.value)} required={esNueva} />
          </Campo>
        </div>
        <p className="text-xs text-slate-500">Las horas son de Colombia, sin importar la zona horaria de este equipo.</p>
        <Campo etiqueta="Motivo (obligatorio, queda en la auditoría)">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
        </Campo>
        <MensajeError error={guardar.error} />
        <div className="flex justify-between gap-2">
          {!esNueva ? (
            <Boton
              variante="peligro"
              disabled={guardar.isPending || motivo.trim().length < 5}
              title={motivo.trim().length < 5 ? 'Escribe el motivo para anular' : undefined}
              onClick={() => confirm('¿Anular esta marcación? No contará en la liquidación.') && guardar.mutate({ anular: true, motivo })}
            >
              Anular
            </Boton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="primario" type="submit" disabled={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>

      {!esNueva && !!historial.data?.length && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Historial ({historial.data.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {historial.data.map((h) => (
              <li key={h.id} className="rounded bg-slate-50 p-2">
                <span className="text-slate-500">
                  {h.creadoEn.fecha} {h.creadoEn.hora} · {h.usuario}:
                </span>{' '}
                {h.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
