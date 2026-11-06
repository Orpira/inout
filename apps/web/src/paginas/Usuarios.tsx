import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { Cargando, Dialogo, Encabezado, MensajeError, useAviso } from "../componentes/ui";
import { api } from "../lib/api";
import { fechaCorta, hora } from "../lib/formato";
import { useSesion } from "../lib/sesion";
import type { Usuario } from "../lib/tipos";

export default function Usuarios() {
  const { usuario } = useSesion();
  const [editando, setEditando] = useState<Usuario | "nuevo" | null>(null);
  const q = useQuery({ queryKey: ["usuarios"], queryFn: () => api<{ datos: Usuario[] }>("/usuarios"), enabled: usuario?.rol === "ADMIN" });
  if (usuario?.rol !== "ADMIN") return <Navigate to="/" replace />;

  return (
    <div>
      <Encabezado
        titulo="Usuarios"
        descripcion="Los supervisores consultan y corrigen marcaciones y descargan la liquidación. Los administradores, además, gestionan empleados, festivos y usuarios."
        acciones={
          <button className="btn btn-primario" onClick={() => setEditando("nuevo")}>
            <Plus size={16} /> Añadir usuario
          </button>
        }
      />
      <div className="panel overflow-x-auto">
        {q.isPending ? (
          <Cargando />
        ) : q.error ? (
          <MensajeError error={q.error} />
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Último acceso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {q.data.datos.map((u) => (
                <tr key={u.id} className="cursor-pointer" onClick={() => setEditando(u)}>
                  <td className="font-semibold">
                    <button className="text-left hover:text-petroleo">{u.nombre}</button>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.rol === "ADMIN" ? "Administrador" : "Supervisor"}</td>
                  <td className="text-tinta-suave">{u.ultimoAcceso ? `${fechaCorta(u.ultimoAcceso)}, ${hora(u.ultimoAcceso)}` : "Nunca"}</td>
                  <td>{u.activo ? "Activo" : <span className="text-tinta-tenue">Desactivado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialogo abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nuevo" ? "Añadir usuario" : "Editar usuario"}>
        {editando !== null && <FormUsuario u={editando === "nuevo" ? null : editando} onListo={() => setEditando(null)} />}
      </Dialogo>
    </div>
  );
}

function FormUsuario({ u, onListo }: { u: Usuario | null; onListo: () => void }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [f, setF] = useState({ nombre: u?.nombre ?? "", email: u?.email ?? "", rol: u?.rol ?? "SUPERVISOR", activo: u?.activo ?? true, password: "" });
  const mut = useMutation({
    mutationFn: () => (u ? api(`/usuarios/${u.id}`, { method: "PUT", body: f }) : api("/usuarios", { body: f })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      aviso(u ? "Usuario actualizado" : "Usuario añadido");
      onListo();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <div>
        <label className="etiqueta" htmlFor="u-nom">Nombre</label>
        <input id="u-nom" required className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="u-email">Correo</label>
        <input id="u-email" type="email" required className="campo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="u-rol">Rol</label>
        <select id="u-rol" className="campo" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Usuario["rol"] })}>
          <option value="SUPERVISOR">Supervisor</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <div>
        <label className="etiqueta" htmlFor="u-pass">{u ? "Nueva contraseña (opcional)" : "Contraseña"}</label>
        <input id="u-pass" type="password" minLength={8} required={!u} autoComplete="new-password" className="campo" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-petroleo)]" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
        Puede iniciar sesión
      </label>
      <MensajeError error={mut.error} />
      <button className="btn btn-primario w-full" disabled={mut.isPending}>
        {u ? "Guardar cambios" : "Añadir usuario"}
      </button>
    </form>
  );
}
