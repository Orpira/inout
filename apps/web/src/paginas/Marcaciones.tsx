import { ETIQUETAS, sumarDias } from "@inout/core";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CintaJornada, LeyendaCinta } from "../componentes/CintaJornada";
import { Cargando, Dialogo, Encabezado, EstadoChip, MensajeError, Paginacion, useAviso, Vacio } from "../componentes/ui";
import { api, descargar } from "../lib/api";
import { aInputLocal, desdeInputLocal, duracion, fechaCorta, hora, hoyLocal, nombreCompleto, pesos } from "../lib/formato";
import type { Empleado, EstadoMarcacion, MarcaOffline, Marcacion, MarcacionDetalle, Pagina } from "../lib/tipos";

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
    // "AUTO" no es un estado: filtra los turnos que el sistema cerró con la hora del horario.
    estado: (sp.get("estado") ?? "") as EstadoMarcacion | "AUTO" | "",
    q: sp.get("q") ?? "",
    extras: (sp.get("extras") ?? "") as "" | "CON" | "PENDIENTE" | "APROBADAS" | "RECHAZADAS",
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
  if (filtros.estado === "AUTO") qs.set("salidaAutomatica", "true");
  else if (filtros.estado) qs.set("estado", filtros.estado);
  if (filtros.q) qs.set("q", filtros.q);
  if (filtros.extras === "CON") qs.set("soloExtras", "true");
  else if (filtros.extras) qs.set("estadoExtras", filtros.extras);

  const lista = useQuery({
    queryKey: ["marcaciones", qs.toString()],
    queryFn: () => api<Pagina<Marcacion>>(`/marcaciones?${qs}`),
    placeholderData: keepPreviousData,
  });
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const aviso = useAviso();
  const modoAprobacion = filtros.extras === "PENDIENTE";
  const aprobarLote = useMutation({
    mutationFn: () => api<{ aprobadas: number }>("/marcaciones/extras/aprobar-lote", { body: { ids: [...seleccion] } }),
    onSuccess: (r) => {
      setSeleccion(new Set());
      void qc.invalidateQueries({ queryKey: ["marcaciones"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      aviso(`${r.aprobadas} ${r.aprobadas === 1 ? "marcación aprobada" : "marcaciones aprobadas"}`);
    },
  });

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
            <option value="AUTO">Salida automática</option>
            <option value="ANULADA">Anuladas</option>
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="etiqueta" htmlFor="f-q">Empleado</label>
          <input id="f-q" type="search" placeholder="Nombre o identificación" className="campo" defaultValue={filtros.q} onChange={(e) => fijar({ q: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="f-extras">Horas extra</label>
          <select id="f-extras" className="campo w-44" value={filtros.extras} onChange={(e) => fijar({ extras: e.target.value })}>
            <option value="">Todas las marcaciones</option>
            <option value="CON">Con horas extra</option>
            <option value="PENDIENTE">Por aprobar</option>
            <option value="APROBADAS">Aprobadas</option>
            <option value="RECHAZADAS">Rechazadas</option>
          </select>
        </div>
      </div>

      <BandejaSinConexion />

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-4 py-2">
          {modoAprobacion ? (
            <div className="flex items-center gap-3">
              <button className="btn btn-primario h-8" disabled={!seleccion.size || aprobarLote.isPending} onClick={() => aprobarLote.mutate()}>
                Aprobar {seleccion.size ? `${seleccion.size} seleccionadas` : "seleccionadas"}
              </button>
              <span className="text-[0.86rem] text-tinta-suave">Aprueba todas las horas extra calculadas. Para aprobar una parte o rechazar, abre la marcación.</span>
            </div>
          ) : (
            <span />
          )}
          <LeyendaCinta />
        </div>
        <MensajeError error={aprobarLote.error} />
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
                  {modoAprobacion && (
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        className="h-4 w-4 accent-[var(--color-petroleo)]"
                        checked={lista.data.datos.length > 0 && lista.data.datos.every((m) => seleccion.has(m.id))}
                        onChange={(e) => setSeleccion(e.target.checked ? new Set(lista.data.datos.map((m) => m.id)) : new Set())}
                      />
                    </th>
                  )}
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
                    {modoAprobacion && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${nombreCompleto(m.empleado)}`}
                          className="h-4 w-4 accent-[var(--color-petroleo)]"
                          checked={seleccion.has(m.id)}
                          onChange={(e) => {
                            const n = new Set(seleccion);
                            if (e.target.checked) n.add(m.id);
                            else n.delete(m.id);
                            setSeleccion(n);
                          }}
                        />
                      </td>
                    )}
                    <td>
                      <button className="text-left font-semibold hover:text-petroleo" onClick={() => setDetalleId(m.id)}>
                        {nombreCompleto(m.empleado)}
                      </button>
                      <div className="text-[0.82rem] text-tinta-tenue tabular-nums">{m.empleado.identificacion}</div>
                    </td>
                    <td className="whitespace-nowrap">{fechaCorta(m.entrada)}</td>
                    <td className="tabular-nums">{hora(m.entrada)}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {m.salida ? hora(m.salida) : <span className="text-tinta-tenue">—</span>}
                      {m.salidaAutomatica && (
                        <span className="ml-1.5 rounded bg-extra-claro px-1.5 py-0.5 text-[0.72rem] font-semibold text-extra-oscuro" title="El empleado no marcó la salida: el sistema la puso con la hora de su horario">
                          Auto
                        </span>
                      )}
                    </td>
                    <td>
                      <CintaJornada entrada={m.entrada} salida={m.salida} minutosExtra={m.minutosExtraCalculados ?? m.minutosExtra} variante="compacta" />
                    </td>
                    <td className="num whitespace-nowrap">{duracion(m.minutosTotales)}</td>
                    <td className="num whitespace-nowrap">
                      <CeldaExtras m={m} />
                    </td>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <EstadoChip estado={m.estado} />
          {m.salidaAutomatica && <span className="inline-flex rounded bg-extra-claro px-2 py-0.5 text-[0.8rem] font-semibold text-extra-oscuro">Salida automática</span>}
        </div>
        {m.salidaAutomatica && (
          <p className="mt-2 text-[0.9rem] text-extra-oscuro">
            El empleado no marcó la salida: el sistema la puso con la hora de su horario. Si no es correcta, corrígela.
          </p>
        )}
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
        <CintaJornada entrada={m.entrada} salida={m.salida} minutosExtra={m.minutosExtraCalculados ?? m.minutosExtra} />
      </div>

      {m.alertas.length > 0 && (
        <ul className="space-y-1 rounded-md bg-alerta-claro px-3 py-2 text-[0.92rem] text-alerta">
          {m.alertas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {(m.minutosDescanso ?? 0) > 0 && (
        <p className="-mt-3 text-[0.9rem] text-tinta-suave">Se descontaron {duracion(m.minutosDescanso)} de descanso no remunerado.</p>
      )}

      {m.estado === "CERRADA" && <PanelExtras m={m} onCambio={refrescar} />}

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
  APROBAR_EXTRAS: "Horas extra aprobadas",
  RECHAZAR_EXTRAS: "Horas extra rechazadas",
  CERRAR_SIN_CONEXION: "Salida recibida del kiosko sin conexión",
};

function CambiosAuditoria({ antes, despues }: { antes: NonNullable<MarcacionDetalle["historial"][number]["antes"]>; despues: NonNullable<MarcacionDetalle["historial"][number]["despues"]> }) {
  const filas: [string, string, string][] = [];
  const fh = (v: string | null | undefined) => (v ? `${fechaCorta(v)} ${hora(v)}` : "sin salida");
  if ("entrada" in despues && antes.entrada !== despues.entrada) filas.push(["Entrada", fh(antes.entrada), fh(despues.entrada)]);
  if ("salida" in despues && antes.salida !== despues.salida) filas.push(["Salida", fh(antes.salida), fh(despues.salida)]);
  if ("estado" in despues && antes.estado !== despues.estado) filas.push(["Estado", (antes.estado ?? "").toLowerCase(), (despues.estado ?? "").toLowerCase()]);
  if ("minutosExtraAprobados" in despues) filas.push(["Extras aprobadas", duracion(antes.minutosExtraAprobados ?? 0), duracion(despues.minutosExtraAprobados ?? 0)]);
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

function CeldaExtras({ m }: { m: Marcacion }) {
  const calc = m.minutosExtraCalculados ?? 0;
  if (!calc) return null;
  switch (m.estadoExtras) {
    case "PENDIENTE":
      return (
        <span className="font-semibold text-extra-oscuro">
          {duracion(calc)}
          <span className="block text-[0.78rem] font-medium">por aprobar</span>
        </span>
      );
    case "RECHAZADAS":
      return (
        <span className="text-tinta-tenue">
          <span className="line-through">{duracion(calc)}</span>
          <span className="block text-[0.78rem]">rechazadas</span>
        </span>
      );
    case "TOLERANCIA":
      return (
        <span className="text-tinta-tenue">
          {duracion(calc)}
          <span className="block text-[0.78rem]">en tolerancia</span>
        </span>
      );
    case "APROBADAS":
      return (
        <span className="font-semibold text-extra-oscuro">
          {duracion(m.minutosExtra)}
          {(m.minutosExtra ?? 0) < calc && <span className="block text-[0.78rem] font-medium">de {duracion(calc)}</span>}
        </span>
      );
    default:
      return <span className="font-semibold text-extra-oscuro">{duracion(m.minutosExtra)}</span>;
  }
}

/** Aprobación, aprobación parcial o rechazo de las horas extra de una marcación. */
function PanelExtras({ m, onCambio }: { m: MarcacionDetalle; onCambio: () => void }) {
  const aviso = useAviso();
  const calc = m.minutosExtraCalculados ?? 0;
  const [modo, setModo] = useState<"ver" | "parcial" | "rechazar">("ver");
  const [horas, setHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  const mut = useMutation({
    mutationFn: (body: { aprobar: boolean; minutos?: number; motivo?: string }) => api(`/marcaciones/${m.id}/extras`, { body }),
    onSuccess: (_r, body) => {
      onCambio();
      setModo("ver");
      aviso(body.aprobar ? "Horas extra aprobadas" : "Horas extra rechazadas");
    },
  });
  if (!calc) return null;
  if (m.estadoExtras === "TOLERANCIA") {
    return <p className="text-[0.92rem] text-tinta-suave">Trabajó {duracion(calc)} por encima de su jornada, dentro de la tolerancia del horario: no se liquidan.</p>;
  }
  if (m.estadoExtras === "AUTOMATICAS") return null;

  const titulo =
    m.estadoExtras === "PENDIENTE"
      ? `${duracion(calc)} extra por aprobar`
      : m.estadoExtras === "APROBADAS"
        ? `Aprobadas ${duracion(m.minutosExtraAprobados)} de ${duracion(calc)} extra`
        : `${duracion(calc)} extra rechazadas`;

  return (
    <div className={`rounded-[10px] border p-4 ${m.estadoExtras === "PENDIENTE" ? "border-extra bg-extra-claro/60" : "border-linea"}`}>
      <p className="font-bold">{titulo}</p>
      <p className="mt-0.5 text-[0.9rem] text-tinta-suave">
        {m.estadoExtras === "PENDIENTE"
          ? "Mientras no se aprueben no entran en la liquidación."
          : "Puedes cambiar la decisión; queda registrada en el historial."}
      </p>
      {modo === "ver" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primario" disabled={mut.isPending} onClick={() => mut.mutate({ aprobar: true })}>
            Aprobar {duracion(calc)}
          </button>
          <button className="btn btn-secundario" onClick={() => setModo("parcial")}>
            Aprobar una parte
          </button>
          <button className="btn btn-peligro" onClick={() => setModo("rechazar")}>
            Rechazar
          </button>
        </div>
      )}
      {modo === "parcial" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({ aprobar: true, minutos: Math.round(Number(horas.replace(",", ".")) * 60), motivo: motivo || undefined });
          }}
        >
          <div>
            <label className="etiqueta" htmlFor="x-horas">Horas a aprobar</label>
            <input id="x-horas" inputMode="decimal" required className="campo w-24" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="1,5" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="etiqueta" htmlFor="x-mot">Motivo (opcional)</label>
            <input id="x-mot" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <button className="btn btn-primario" disabled={mut.isPending}>Aprobar</button>
          <button type="button" className="btn btn-fantasma" onClick={() => setModo("ver")}>Cancelar</button>
        </form>
      )}
      {modo === "rechazar" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({ aprobar: false, motivo });
          }}
        >
          <div className="min-w-56 flex-1">
            <label className="etiqueta" htmlFor="x-rech">Motivo del rechazo</label>
            <input id="x-rech" required minLength={5} className="campo" placeholder="Ej.: no fueron autorizadas" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <button className="btn btn-peligro" disabled={mut.isPending}>Rechazar extras</button>
          <button type="button" className="btn btn-fantasma" onClick={() => setModo("ver")}>Cancelar</button>
        </form>
      )}
      <MensajeError error={mut.error} />
    </div>
  );
}

/** Marcaciones del kiosko capturadas sin conexión que el servidor no pudo aplicar. */
function BandejaSinConexion() {
  const qc = useQueryClient();
  const aviso = useAviso();
  const q = useQuery({ queryKey: ["offline", "RECHAZADA"], queryFn: () => api<{ datos: MarcaOffline[] }>("/marcaciones/offline?estado=RECHAZADA") });
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const mut = useMutation({
    mutationFn: (id: string) => api(`/marcaciones/offline/${id}/resolver`, { body: { nota } }),
    onSuccess: () => {
      setResolviendo(null);
      setNota("");
      void qc.invalidateQueries({ queryKey: ["offline"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      aviso("Marcación marcada como resuelta");
    },
  });
  if (!q.data?.datos.length) return null;
  return (
    <section className="mb-4 rounded-[10px] border border-alerta/40 bg-superficie">
      <div className="border-b border-linea px-4 py-3">
        <h2 className="font-bold text-alerta">
          {q.data.datos.length} {q.data.datos.length === 1 ? "marcación del kiosko no se pudo aplicar" : "marcaciones del kiosko no se pudieron aplicar"}
        </h2>
        <p className="text-[0.9rem] text-tinta-suave">
          Se capturaron sin conexión y el servidor no pudo registrarlas automáticamente. Regístralas a mano si corresponde y márcalas como resueltas.
        </p>
      </div>
      <ul className="divide-y divide-linea">
        {q.data.datos.map((x) => (
          <li key={x.id} className="px-4 py-3 text-[0.93rem]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong>{x.empleado ?? `Código ${x.codigo}`}</strong>
                <span className="ml-3 tabular-nums">{fechaCorta(x.capturadoEn)}, {hora(x.capturadoEn)}</span>
                {x.dispositivo && <span className="ml-3 text-tinta-tenue">{x.dispositivo}</span>}
              </span>
              {resolviendo !== x.id && (
                <button className="btn btn-secundario h-8" onClick={() => setResolviendo(x.id)}>
                  Marcar como resuelta
                </button>
              )}
            </div>
            <p className="text-alerta">{x.mensaje}</p>
            {resolviendo === x.id && (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  mut.mutate(x.id);
                }}
              >
                <input required minLength={5} className="campo min-w-64 flex-1" placeholder="Cómo se resolvió (ej.: registrada manualmente)" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota de resolución" />
                <button className="btn btn-primario" disabled={mut.isPending}>Guardar</button>
                <button type="button" className="btn btn-fantasma" onClick={() => setResolviendo(null)}>Cancelar</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <MensajeError error={mut.error} />
    </section>
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
