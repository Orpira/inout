import { ETIQUETAS, sumarDias } from "@inout/core";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CintaJornada, LeyendaCinta } from "../componentes/CintaJornada";
import { Cargando, Dialogo, Encabezado, EstadoChip, MensajeError, Paginacion, useAviso, Vacio } from "../componentes/ui";
import { api, descargar } from "../lib/api";
import { aInputLocal, desdeInputLocal, duracion, fechaCorta, hora, hoyLocal, nombreCompleto, pesos } from "../lib/formato";
import type { Empleado, EstadoMarcacion, Marcacion, MarcacionDetalle, Pagina } from "../lib/tipos";

const ORIGEN: Record<Marcacion["origen"], string> = {
  KIOSKO: "Kiosko",
  KIOSKO_OFFLINE: "Kiosko (sin conexión)",
  MANUAL: "Registro manual",
  MIGRACION: "Migrado del sistema anterior",
};

export default function Marcaciones() {
  const [sp, setSp] = useSearchParams();
  const filtros = {
    desde: sp.get("desde") ?? sumarDias(hoyLocal(), -14),
    hasta: sp.get("hasta") ?? hoyLocal(),
    estado: (sp.get("estado") ?? "") as EstadoMarcacion | "",
    q: sp.get("q") ?? "",
    soloExtras: sp.get("soloExtras") === "1",
    pagina: Number(sp.get("pagina") ?? 1),
  };
  const fijar = (cambios: Record<string, string | number | boolean | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "" || v === false) n.delete(k);
      else n.set(k, v === true ? "1" : String(v));
    }
    if (!("pagina" in cambios)) n.delete("pagina");
    setSp(n, { replace: true });
  };

  const qs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta, pagina: String(filtros.pagina), porPagina: "25" });
  if (filtros.estado) qs.set("estado", filtros.estado);
  if (filtros.q) qs.set("q", filtros.q);
  if (filtros.soloExtras) qs.set("soloExtras", "true");

  const lista = useQuery({
    queryKey: ["marcaciones", qs.toString()],
    queryFn: () => api<Pagina<Marcacion>>(`/marcaciones?${qs}`),
    placeholderData: keepPreviousData,
  });
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);

  return (
    <div>
      <Encabezado
        titulo="Marcaciones"
        descripcion="Entradas y salidas de cada turno con su liquidación. Toda corrección exige un motivo y queda en el historial."
        acciones={
          <>
            <button className="btn btn-secundario" onClick={() => descargar(`/reportes/marcaciones?desde=${filtros.desde}&hasta=${filtros.hasta}`)}>
              <Download size={16} /> Exportar CSV
            </button>
            <button className="btn btn-primario" onClick={() => setNueva(true)}>
              <Plus size={16} /> Registrar marcación
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="etiqueta" htmlFor="f-desde">Desde</label>
          <input id="f-desde" type="date" className="campo w-40" value={filtros.desde} onChange={(e) => fijar({ desde: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="f-hasta">Hasta</label>
          <input id="f-hasta" type="date" className="campo w-40" value={filtros.hasta} onChange={(e) => fijar({ hasta: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="f-estado">Estado</label>
          <select id="f-estado" className="campo w-40" value={filtros.estado} onChange={(e) => fijar({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="ABIERTA">En turno</option>
            <option value="CERRADA">Cerradas</option>
            <option value="REVISION">Por revisar</option>
            <option value="ANULADA">Anuladas</option>
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="etiqueta" htmlFor="f-q">Empleado</label>
          <input id="f-q" type="search" placeholder="Nombre o identificación" className="campo" defaultValue={filtros.q} onChange={(e) => fijar({ q: e.target.value })} />
        </div>
        <label className="flex h-9 items-center gap-2 text-[0.93rem]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-extra)]" checked={filtros.soloExtras} onChange={(e) => fijar({ soloExtras: e.target.checked })} />
          Solo con horas extra
        </label>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex justify-end border-b border-linea px-4 py-2">
          <LeyendaCinta />
        </div>
        {lista.isPending ? (
          <Cargando />
        ) : lista.error ? (
          <div className="p-4">
            <MensajeError error={lista.error} />
          </div>
        ) : lista.data.datos.length === 0 ? (
          <Vacio titulo="No hay marcaciones con estos filtros">Amplía el rango de fechas o quita algún filtro.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th className="w-[26%] min-w-48">Turno (06:00 a 06:00)</th>
                  <th className="num">Duración</th>
                  <th className="num">Extra</th>
                  <th className="num">Recargos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.data.datos.map((m) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => setDetalleId(m.id)}>
                    <td>
                      <button className="text-left font-semibold hover:text-petroleo" onClick={() => setDetalleId(m.id)}>
                        {nombreCompleto(m.empleado)}
                      </button>
                      <div className="text-[0.82rem] text-tinta-tenue tabular-nums">{m.empleado.identificacion}</div>
                    </td>
                    <td className="whitespace-nowrap">{fechaCorta(m.entrada)}</td>
                    <td className="tabular-nums">{hora(m.entrada)}</td>
                    <td className="tabular-nums">{m.salida ? hora(m.salida) : <span className="text-tinta-tenue">—</span>}</td>
                    <td>
                      <CintaJornada entrada={m.entrada} salida={m.salida} minutosExtra={m.minutosExtra} variante="compacta" />
                    </td>
                    <td className="num whitespace-nowrap">{duracion(m.minutosTotales)}</td>
                    <td className="num whitespace-nowrap font-semibold text-extra-oscuro">{m.minutosExtra ? duracion(m.minutosExtra) : ""}</td>
                    <td className="num whitespace-nowrap">
                      {m.valorRecargos ? pesos(m.valorRecargos) : ""}
                      {m.alertas.length > 0 && <TriangleAlert size={14} className="ml-1 inline text-alerta" aria-label="Con alertas" />}
                    </td>
                    <td>
                      <EstadoChip estado={m.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista.data && (
          <Paginacion pagina={filtros.pagina} total={lista.data.total} porPagina={lista.data.porPagina} onCambiar={(p) => fijar({ pagina: p })} />
        )}
      </div>

      <Dialogo abierto={detalleId !== null} onCerrar={() => setDetalleId(null)} titulo="Detalle de la marcación" lateral ancho="max-w-[640px]">
        {detalleId !== null && <DetalleMarcacion id={detalleId} />}
      </Dialogo>
      <Dialogo abierto={nueva} onCerrar={() => setNueva(false)} titulo="Registrar marcación manual">
        {nueva && <FormNueva onListo={() => setNueva(false)} />}
      </Dialogo>
    </div>
  );
}

function DetalleMarcacion({ id }: { id: number }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const q = useQuery({ queryKey: ["marcacion", id], queryFn: () => api<MarcacionDetalle>(`/marcaciones/${id}`) });
  const [modo, setModo] = useState<"ver" | "editar" | "anular">("ver");

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["marcaciones"] });
    void qc.invalidateQueries({ queryKey: ["marcacion", id] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  if (q.isPending) return <Cargando />;
  if (q.error) return <MensajeError error={q.error} />;
  const m = q.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xl font-bold">{nombreCompleto(m.empleado)}</p>
        <p className="text-tinta-suave">
          <span>{fechaCorta(m.entrada)}</span>
          <span className="ml-3">{ORIGEN[m.origen]}</span>
        </p>
        <div className="mt-2">
          <EstadoChip estado={m.estado} />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between tabular-nums">
          <span>
            <span className="text-tinta-suave">Entrada</span> <strong>{hora(m.entrada)}</strong>
          </span>
          <span>
            <span className="text-tinta-suave">Salida</span> <strong>{m.salida ? hora(m.salida) : "sin registrar"}</strong>
          </span>
        </div>
        <CintaJornada entrada={m.entrada} salida={m.salida} minutosExtra={m.minutosExtra} />
      </div>

      {m.alertas.length > 0 && (
        <ul className="space-y-1 rounded-md bg-alerta-claro px-3 py-2 text-[0.92rem] text-alerta">
          {m.alertas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {m.estado === "REVISION" && modo === "ver" && (
        <p className="rounded-md border border-alerta/30 px-3 py-2 text-[0.93rem]">
          Este turno quedó sin salida. Registra la hora real de salida para liquidarlo, o anúlalo si no corresponde.
        </p>
      )}

      {m.lineas.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">Liquidación</h3>
          <table className="tabla">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num">Horas</th>
                <th className="num">Factor</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {m.lineas.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className={l.categoria.startsWith("EXT") ? "font-semibold text-extra-oscuro" : ""}>{ETIQUETAS[l.categoria].larga}</span>
                    <span className="ml-2 text-[0.8rem] text-tinta-tenue">{ETIQUETAS[l.categoria].corta}</span>
                  </td>
                  <td className="num">{duracion(l.minutos)}</td>
                  <td className="num">{l.factor ? `${Math.round(l.factor * 100)} %` : "Incluida"}</td>
                  <td className="num">{l.valor ? pesos(l.valor) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-2 font-bold" colSpan={3}>
                  Total a pagar adicional al salario
                  <div className="text-[0.8rem] font-normal text-tinta-tenue">Valor hora ordinaria {pesos(m.lineas[0]!.valorHora)}</div>
                </td>
                <td className="num pt-2 font-bold">{pesos(m.valorRecargos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {m.observacion && (
        <div>
          <h3 className="mb-1 font-bold">Observaciones</h3>
          <p className="whitespace-pre-line text-[0.93rem] text-tinta-suave">{m.observacion}</p>
        </div>
      )}

      {m.estado !== "ANULADA" && modo === "ver" && (
        <div className="flex gap-2">
          <button className="btn btn-primario" onClick={() => setModo("editar")}>
            {m.estado === "REVISION" || m.estado === "ABIERTA" ? "Registrar salida o corregir" : "Corregir horas"}
          </button>
          <button className="btn btn-peligro" onClick={() => setModo("anular")}>
            Anular
          </button>
        </div>
      )}
      {modo === "editar" && (
        <FormEditar
          m={m}
          onCancelar={() => setModo("ver")}
          onListo={() => {
            refrescar();
            setModo("ver");
            aviso("Marcación corregida");
          }}
        />
      )}
      {modo === "anular" && (
        <FormAnular
          id={m.id}
          onCancelar={() => setModo("ver")}
          onListo={() => {
            refrescar();
            setModo("ver");
            aviso("Marcación anulada");
          }}
        />
      )}

      {m.historial.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">Historial de cambios</h3>
          <ol className="space-y-3 border-l-2 border-linea pl-4">
            {m.historial.map((h) => (
              <li key={h.id} className="text-[0.92rem]">
                <p>
                  <strong>{ACCIONES[h.accion] ?? h.accion}</strong>
                  <span className="text-tinta-suave"> por {h.usuario ?? "el sistema"}, {fechaCorta(h.creadoEn)} {hora(h.creadoEn)}</span>
                </p>
                {h.motivo && <p className="text-tinta-suave">“{h.motivo}”</p>}
                {h.antes && h.despues && <CambiosAuditoria antes={h.antes} despues={h.despues} />}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

const ACCIONES: Record<string, string> = {
  CREAR: "Registro manual",
  EDITAR: "Corrección",
  ANULAR: "Anulación",
  ENVIAR_REVISION: "Enviada a revisión",
};

function CambiosAuditoria({ antes, despues }: { antes: NonNullable<MarcacionDetalle["historial"][number]["antes"]>; despues: NonNullable<MarcacionDetalle["historial"][number]["despues"]> }) {
  const filas: [string, string, string][] = [];
  const fh = (v: string | null) => (v ? `${fechaCorta(v)} ${hora(v)}` : "sin salida");
  if (antes.entrada !== despues.entrada) filas.push(["Entrada", fh(antes.entrada), fh(despues.entrada)]);
  if (antes.salida !== despues.salida) filas.push(["Salida", fh(antes.salida), fh(despues.salida)]);
  if (antes.estado !== despues.estado) filas.push(["Estado", antes.estado.toLowerCase(), despues.estado.toLowerCase()]);
  if (!filas.length) return null;
  return (
    <ul className="mt-1 text-[0.86rem] tabular-nums text-tinta-suave">
      {filas.map(([c, a, d]) => (
        <li key={c}>
          {c}: <span className="line-through">{a}</span> <span className="text-tinta">{d}</span>
        </li>
      ))}
    </ul>
  );
}

function FormEditar({ m, onCancelar, onListo }: { m: MarcacionDetalle; onCancelar: () => void; onListo: () => void }) {
  const entradaInicial = aInputLocal(m.entrada);
  const salidaInicial = aInputLocal(m.salida);
  const [entrada, setEntrada] = useState(entradaInicial);
  const [salida, setSalida] = useState(salidaInicial);
  const [observacion, setObservacion] = useState(m.observacion ?? "");
  const [motivo, setMotivo] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api(`/marcaciones/${m.id}`, {
        method: "PATCH",
        // Solo se envían los campos modificados: el input descarta los segundos y no debe alterar la hora original.
        body: {
          ...(entrada !== entradaInicial ? { entrada: desdeInputLocal(entrada) } : {}),
          ...(salida !== salidaInicial ? { salida: desdeInputLocal(salida) } : {}),
          observacion: observacion || null,
          motivo,
        },
      }),
    onSuccess: onListo,
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    mut.mutate();
  };
  return (
    <form onSubmit={enviar} className="space-y-4 rounded-[10px] border border-linea bg-papel p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="e-ent">Entrada</label>
          <input id="e-ent" type="datetime-local" required className="campo" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="e-sal">Salida</label>
          <input id="e-sal" type="datetime-local" className="campo" value={salida} onChange={(e) => setSalida(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="e-obs">Observaciones</label>
        <textarea id="e-obs" rows={2} className="campo" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="e-mot">Motivo de la corrección</label>
        <input id="e-mot" required minLength={5} className="campo" placeholder="Ej.: el empleado olvidó marcar la salida" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <MensajeError error={mut.error} />
      <div className="flex gap-2">
        <button className="btn btn-primario" disabled={mut.isPending}>
          {mut.isPending ? "Guardando…" : "Guardar corrección"}
        </button>
        <button type="button" className="btn btn-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormAnular({ id, onCancelar, onListo }: { id: number; onCancelar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const mut = useMutation({ mutationFn: () => api(`/marcaciones/${id}/anular`, { body: { motivo } }), onSuccess: onListo });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="space-y-3 rounded-[10px] border border-alerta/30 bg-alerta-claro/50 p-4"
    >
      <p className="text-[0.93rem]">La marcación dejará de contar en la liquidación. Se conserva en el historial.</p>
      <div>
        <label className="etiqueta" htmlFor="a-mot">Motivo de la anulación</label>
        <input id="a-mot" required minLength={5} className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <MensajeError error={mut.error} />
      <div className="flex gap-2">
        <button className="btn btn-peligro" disabled={mut.isPending}>
          Anular marcación
        </button>
        <button type="button" className="btn btn-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormNueva({ onListo }: { onListo: () => void }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const emps = useQuery({ queryKey: ["empleados", "activos"], queryFn: () => api<{ datos: Empleado[] }>("/empleados?estado=activos") });
  const [empleadoId, setEmpleadoId] = useState("");
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [observacion, setObservacion] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/marcaciones", {
        body: {
          empleadoId: Number(empleadoId),
          entrada: desdeInputLocal(entrada),
          salida: desdeInputLocal(salida),
          observacion: observacion || null,
          motivo,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["marcaciones"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      aviso("Marcación registrada");
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
        <label className="etiqueta" htmlFor="n-emp">Empleado</label>
        <select id="n-emp" required className="campo" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
          <option value="">Selecciona…</option>
          {emps.data?.datos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.apellido}, {e.nombre} ({e.identificacion})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="n-ent">Entrada</label>
          <input id="n-ent" type="datetime-local" required className="campo" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="n-sal">Salida (opcional)</label>
          <input id="n-sal" type="datetime-local" className="campo" value={salida} onChange={(e) => setSalida(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="n-obs">Observaciones</label>
        <textarea id="n-obs" rows={2} className="campo" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="n-mot">Motivo del registro manual</label>
        <input id="n-mot" required minLength={5} className="campo" placeholder="Ej.: el kiosko estaba fuera de servicio" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <MensajeError error={mut.error} />
      <button className="btn btn-primario w-full" disabled={mut.isPending}>
        {mut.isPending ? "Registrando…" : "Registrar marcación"}
      </button>
    </form>
  );
}
