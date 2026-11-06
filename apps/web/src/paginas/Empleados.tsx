import { minutosOrdinariosPorDefecto } from "@inout/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { HistorialCambios } from "../componentes/Historial";
import { Cargando, Dialogo, Encabezado, MensajeError, useAviso, Vacio } from "../componentes/ui";
import { api } from "../lib/api";
import { duracion, hoyLocal, nombreCompleto, pesos } from "../lib/formato";
import { useSesion } from "../lib/sesion";
import type { Empleado, Horario } from "../lib/tipos";

export default function Empleados() {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "ADMIN";
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"activos" | "inactivos" | "todos">("activos");
  const [editando, setEditando] = useState<Empleado | "nuevo" | null>(null);
  const lista = useQuery({
    queryKey: ["empleados", estado, q],
    queryFn: () => api<{ datos: Empleado[] }>(`/empleados?estado=${estado}&q=${encodeURIComponent(q)}`),
  });
  const jornadaLegal = minutosOrdinariosPorDefecto(hoyLocal());

  return (
    <div>
      <Encabezado
        titulo="Empleados"
        descripcion="El código de marcación es el número de identificación. El salario determina el valor de la hora ordinaria."
        acciones={
          esAdmin && (
            <button className="btn btn-primario" onClick={() => setEditando("nuevo")}>
              <Plus size={16} /> Añadir empleado
            </button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="etiqueta" htmlFor="b-emp">Buscar</label>
          <input id="b-emp" type="search" className="campo" placeholder="Nombre, identificación o cargo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="b-est">Mostrar</label>
          <select id="b-est" className="campo w-40" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        {lista.isPending ? (
          <Cargando />
        ) : lista.error ? (
          <div className="p-4">
            <MensajeError error={lista.error} />
          </div>
        ) : lista.data.datos.length === 0 ? (
          <Vacio titulo={q ? "Ningún empleado coincide con la búsqueda" : "Todavía no hay empleados"}>
            {esAdmin && !q && "Añade el primero para que pueda marcar en el kiosko."}
          </Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Identificación</th>
                <th>Nombre</th>
                <th>Cargo</th>
                <th className="num">Salario</th>
                <th>Horario</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.data.datos.map((e) => (
                <tr key={e.id} className={esAdmin ? "cursor-pointer" : ""} onClick={() => esAdmin && setEditando(e)}>
                  <td className="tabular-nums">{e.identificacion}</td>
                  <td className="font-semibold">{esAdmin ? <button className="text-left hover:text-petroleo">{nombreCompleto(e)}</button> : nombreCompleto(e)}</td>
                  <td className="text-tinta-suave">{e.cargo ?? "—"}</td>
                  <td className="num">{pesos(e.salario)}</td>
                  <td>{e.horario ?? <span className="text-tinta-tenue">Jornada legal L-S ({duracion(jornadaLegal)})</span>}</td>
                  <td>
                    {!e.activo ? (
                      <span className="text-tinta-tenue">Inactivo</span>
                    ) : e.enTurno ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-petroleo">
                        <span className="h-2 w-2 rounded-full bg-petroleo" /> En turno
                      </span>
                    ) : (
                      <span className="text-tinta-suave">Activo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialogo abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nuevo" ? "Añadir empleado" : "Editar empleado"}>
        {editando !== null && <FormEmpleado empleado={editando === "nuevo" ? null : editando} onListo={() => setEditando(null)} jornadaLegal={jornadaLegal} />}
      </Dialogo>
    </div>
  );
}

function FormEmpleado({ empleado, onListo, jornadaLegal }: { empleado: Empleado | null; onListo: () => void; jornadaLegal: number }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [f, setF] = useState({
    identificacion: empleado?.identificacion ?? "",
    nombre: empleado?.nombre ?? "",
    apellido: empleado?.apellido ?? "",
    cargo: empleado?.cargo ?? "",
    email: empleado?.email ?? "",
    telefono: empleado?.telefono ?? "",
    salario: empleado ? String(empleado.salario) : "",
    horarioId: empleado?.horarioId ? String(empleado.horarioId) : "",
    fechaIngreso: empleado?.fechaIngreso ?? "",
    activo: empleado?.activo ?? true,
    motivo: "",
  });
  const horarios = useQuery({ queryKey: ["horarios"], queryFn: () => api<{ datos: Horario[] }>("/horarios") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const mut = useMutation({
    mutationFn: () => {
      const { motivo, ...resto } = f;
      const body = {
        ...resto,
        ...(empleado ? { motivo } : {}),
        salario: Number(f.salario),
        horarioId: f.horarioId ? Number(f.horarioId) : null,
      };
      return empleado ? api(`/empleados/${empleado.id}`, { method: "PUT", body }) : api("/empleados", { body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["empleados"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      aviso(empleado ? "Empleado actualizado" : "Empleado añadido");
      onListo();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    mut.mutate();
  };
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="identificacion" etiqueta="Identificación (código de marcación)" valor={f.identificacion} onChange={set("identificacion")} requerido />
        <Campo id="cargo" etiqueta="Cargo" valor={f.cargo} onChange={set("cargo")} />
        <Campo id="nombre" etiqueta="Nombres" valor={f.nombre} onChange={set("nombre")} requerido />
        <Campo id="apellido" etiqueta="Apellidos" valor={f.apellido} onChange={set("apellido")} requerido />
        <Campo id="salario" etiqueta="Salario mensual (COP)" valor={f.salario} onChange={set("salario")} requerido tipo="number" />
        <div>
          <label className="etiqueta" htmlFor="horario">Horario</label>
          <select id="horario" className="campo" value={f.horarioId} onChange={set("horarioId")}>
            <option value="">Jornada legal L-S ({duracion(jornadaLegal)} diarias)</option>
            {horarios.data?.datos
              .filter((h) => h.activo || String(h.id) === f.horarioId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
          </select>
          <p className="mt-1 text-[0.8rem] text-tinta-tenue">Define la jornada ordinaria, el descanso y si sus extras requieren aprobación.</p>
        </div>
        <Campo id="email" etiqueta="Correo" valor={f.email} onChange={set("email")} tipo="email" />
        <Campo id="telefono" etiqueta="Teléfono" valor={f.telefono} onChange={set("telefono")} />
        <Campo id="fechaIngreso" etiqueta="Fecha de ingreso" valor={f.fechaIngreso} onChange={set("fechaIngreso")} tipo="date" />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-petroleo)]" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
        Activo (puede marcar en el kiosko)
      </label>
      {empleado && (
        <div>
          <label className="etiqueta" htmlFor="e-motivo">Motivo del cambio</label>
          <input id="e-motivo" required minLength={5} className="campo" placeholder="Ej.: incremento salarial de 2026" value={f.motivo} onChange={set("motivo")} />
        </div>
      )}
      <MensajeError error={mut.error} />
      <button className="btn btn-primario w-full" disabled={mut.isPending}>
        {mut.isPending ? "Guardando…" : empleado ? "Guardar cambios" : "Añadir empleado"}
      </button>
      {empleado && <HistorialCambios entidad="empleado" entidadId={empleado.id} />}
    </form>
  );
}

function Campo({ id, etiqueta, valor, onChange, requerido, tipo = "text" }: { id: string; etiqueta: string; valor: string; onChange: (e: { target: { value: string } }) => void; requerido?: boolean; tipo?: string }) {
  return (
    <div>
      <label className="etiqueta" htmlFor={id}>{etiqueta}</label>
      <input id={id} type={tipo} required={requerido} className="campo" value={valor} onChange={onChange} />
    </div>
  );
}
