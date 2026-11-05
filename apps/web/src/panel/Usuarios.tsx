import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import type { Usuario } from './tipos';
import { Boton, Campo, Entrada, MensajeError, Modal, Selector, Tabla } from './ui';

function FormUsuario({ usuario, onCerrar }: { usuario?: Usuario; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState(usuario?.rol ?? 'SUPERVISOR');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [clave, setClave] = useState('');
  const [motivo, setMotivo] = useState('');
  const guardar = useMutation({
    mutationFn: (cuerpo: object) =>
      usuario
        ? api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) })
        : api('/usuarios', { method: 'POST', body: JSON.stringify(cuerpo) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onCerrar();
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate(usuario ? { rol, activo, clave: clave || undefined, motivo } : { email, nombre, rol, clave });
  };
  return (
    <Modal titulo={usuario ? `Editar · ${usuario.nombre}` : 'Nuevo usuario'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        {!usuario && (
          <>
            <Campo etiqueta="Correo">
              <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Nombre">
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} required />
            </Campo>
          </>
        )}
        <Campo etiqueta="Rol">
          <Selector value={rol} onChange={(e) => setRol(e.target.value as Usuario['rol'])}>
            <option value="SUPERVISOR">Supervisor: marcaciones y liquidación</option>
            <option value="ADMIN">Administrador: además empleados, festivos y usuarios</option>
          </Selector>
        </Campo>
        <Campo etiqueta={usuario ? 'Nueva clave (vacía = no cambiar)' : 'Clave inicial'}>
          <Entrada type="password" value={clave} onChange={(e) => setClave(e.target.value)} minLength={10} required={!usuario} autoComplete="new-password" />
        </Campo>
        {usuario && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
            </label>
            <Campo etiqueta="Motivo del cambio">
              <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
            </Campo>
          </>
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

export function Usuarios() {
  const [editando, setEditando] = useState<Usuario | 'nuevo'>();
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });
  return (
    <section className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Boton variante="primario" onClick={() => setEditando('nuevo')}>
          Nuevo usuario
        </Boton>
      </div>
      <MensajeError error={q.error} />
      {q.data && (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'text-slate-400'}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>{u.rol === 'ADMIN' ? 'Administrador' : 'Supervisor'}</td>
                <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="text-right">
                  <Boton onClick={() => setEditando(u)}>Editar</Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {editando && <FormUsuario usuario={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(undefined)} />}
    </section>
  );
}
