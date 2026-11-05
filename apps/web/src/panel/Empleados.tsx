import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import type { Empleado } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Tabla, Vacio, horas, pesos } from './ui';

function FormEmpleado({ empleado, onCerrar }: { empleado?: Empleado; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [documento, setDocumento] = useState(empleado?.documento ?? '');
  const [nombre, setNombre] = useState(empleado?.nombre ?? '');
  const [salario, setSalario] = useState(empleado ? String(empleado.salarioMensual) : '');
  const [jornada, setJornada] = useState(empleado?.jornadaPactadaMin ? String(empleado.jornadaPactadaMin / 60) : '');
  const [activo, setActivo] = useState(empleado?.activo ?? true);
  const [motivo, setMotivo] = useState('');

  const guardar = useMutation({
    mutationFn: (cuerpo: object) =>
      empleado
        ? api(`/empleados/${empleado.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) })
        : api('/empleados', { method: 'POST', body: JSON.stringify(cuerpo) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      qc.invalidateQueries({ queryKey: ['liquidacion'] });
      onCerrar();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const datos = {
      documento,
      nombre,
      salarioMensual: Number(salario),
      jornadaPactadaMin: jornada ? Math.round(Number(jornada.replace(',', '.')) * 60) : null,
      activo,
    };
    guardar.mutate(empleado ? { ...datos, motivo } : datos);
  };

  return (
    <Modal titulo={empleado ? `Editar · ${empleado.nombre}` : 'Nuevo empleado'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Documento">
            <Entrada value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" pattern="\d{3,20}" required />
          </Campo>
          <Campo etiqueta="Nombre completo">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} required />
          </Campo>
          <Campo etiqueta="Salario mensual (COP)">
            <Entrada type="number" min={1} step={1} value={salario} onChange={(e) => setSalario(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Jornada diaria pactada (h)">
            <Entrada value={jornada} onChange={(e) => setJornada(e.target.value)} placeholder="Legal ÷ 6" inputMode="decimal" />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo (puede marcar en el kiosko)
        </label>
        {empleado && (
          <Campo etiqueta="Motivo del cambio">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
          </Campo>
        )}
        <MensajeError error={guardar.error} />
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" type="submit" disabled={guardar.isPending}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

export function Empleados() {
  const [editando, setEditando] = useState<Empleado | 'nuevo'>();
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados') });
  return (
    <section className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Boton variante="primario" onClick={() => setEditando('nuevo')}>
          Nuevo empleado
        </Boton>
      </div>
      <MensajeError error={q.error} />
      {q.data &&
        (q.data.length ? (
          <Tabla>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombre</th>
                <th>Salario</th>
                <th>Jornada diaria</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((e) => (
                <tr key={e.id} className={e.activo ? '' : 'text-slate-400'}>
                  <td className="tabular-nums">{e.documento}</td>
                  <td>{e.nombre}</td>
                  <td className="tabular-nums">{pesos(e.salarioMensual)}</td>
                  <td>{e.jornadaPactadaMin ? `${horas(e.jornadaPactadaMin)} pactada` : 'Legal'}</td>
                  <td>{e.activo ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">
                    <Boton onClick={() => setEditando(e)}>Editar</Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : (
          <Vacio>Aún no hay empleados.</Vacio>
        ))}
      {editando && <FormEmpleado empleado={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(undefined)} />}
    </section>
  );
}
