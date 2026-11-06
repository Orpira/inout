import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HistorialCambios } from "../componentes/Historial";
import { Cargando, Encabezado, MensajeError, useAviso } from "../componentes/ui";
import { api } from "../lib/api";
import { fechaISOCorta, hoyLocal } from "../lib/formato";
import { useSesion } from "../lib/sesion";

interface Parametros {
  vigentes: {
    jornadaSemanal: number;
    divisorMensual: number;
    inicioNocturno: string;
    recargoNocturno: number;
    recargoDominical: number;
    recargoExtraDiurna: number;
    recargoExtraNocturna: number;
  };
  historico: {
    jornadaSemanal: { desde: string; valor: number }[];
    inicioNocturno: { desde: string; valor: string }[];
    recargoDominical: { desde: string; valor: number }[];
  };
}
interface Festivos {
  festivos: { fecha: string; nombre: string; origen: "LEY" | "AJUSTE" }[];
  ajustes: { fecha: string; tipo: "AGREGAR" | "QUITAR"; descripcion: string | null }[];
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export default function Configuracion() {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "ADMIN";
  const [anio, setAnio] = useState(Number(hoyLocal().slice(0, 4)));
  const p = useQuery({ queryKey: ["parametros"], queryFn: () => api<Parametros>("/config/parametros") });
  const f = useQuery({ queryKey: ["festivos", anio], queryFn: () => api<Festivos>(`/config/festivos?anio=${anio}`) });

  return (
    <div>
      <Encabezado
        titulo="Festivos y normas laborales"
        descripcion="INOUT aplica a cada turno las reglas vigentes en su fecha (Ley 2101 de 2021 y Ley 2466 de 2025), así una liquidación antigua no cambia cuando entra en vigor una norma nueva."
      />

      <div className="grid gap-8 xl:grid-cols-[1fr_1.1fr]">
        <section>
          <h2 className="mb-3 text-lg font-bold">Reglas vigentes hoy</h2>
          {p.isPending ? (
            <Cargando />
          ) : p.error ? (
            <MensajeError error={p.error} />
          ) : (
            <>
              <div className="panel">
                <table className="tabla">
                  <tbody>
                    <Fila concepto="Jornada máxima semanal" valor={`${p.data.vigentes.jornadaSemanal} h`} nota={`Valor hora = salario ÷ ${p.data.vigentes.divisorMensual}`} />
                    <Fila concepto="Franja nocturna" valor={`${p.data.vigentes.inicioNocturno} a 06:00`} />
                    <Fila concepto="Recargo nocturno" valor={pct(p.data.vigentes.recargoNocturno)} />
                    <Fila concepto="Recargo dominical y festivo" valor={pct(p.data.vigentes.recargoDominical)} />
                    <Fila concepto="Hora extra diurna" valor={`+${pct(p.data.vigentes.recargoExtraDiurna)}`} />
                    <Fila concepto="Hora extra nocturna" valor={`+${pct(p.data.vigentes.recargoExtraNocturna)}`} />
                    <Fila concepto="Límite de horas extra" valor="2 h diarias, 12 h semanales" nota="Se señala como alerta, no bloquea" />
                  </tbody>
                </table>
              </div>
              <h3 className="mb-2 mt-6 font-bold">Calendario de cambios</h3>
              <ul className="space-y-1.5 text-[0.92rem]">
                {[
                  ...p.data.historico.jornadaSemanal.map((h) => ({ desde: h.desde, texto: `Jornada de ${h.valor} h semanales` })),
                  ...p.data.historico.inicioNocturno.map((h) => ({ desde: h.desde, texto: `Jornada nocturna desde las ${h.valor}` })),
                  ...p.data.historico.recargoDominical.map((h) => ({ desde: h.desde, texto: `Recargo dominical del ${pct(h.valor)}` })),
                ]
                  .sort((a, b) => a.desde.localeCompare(b.desde))
                  .map((h) => {
                    const futuro = h.desde > hoyLocal();
                    return (
                      <li key={h.desde + h.texto} className={`grid grid-cols-[7.5rem_1fr] ${futuro ? "text-petroleo" : "text-tinta-suave"}`}>
                        <span className="tabular-nums">{h.desde}</span>
                        <span>
                          {h.texto}
                          {futuro && " (próximo)"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Festivos de {anio}</h2>
            <div className="flex gap-1">
              <button className="btn btn-secundario h-8" onClick={() => setAnio(anio - 1)}>{anio - 1}</button>
              <button className="btn btn-secundario h-8" onClick={() => setAnio(anio + 1)}>{anio + 1}</button>
            </div>
          </div>
          {f.isPending ? (
            <Cargando />
          ) : f.error ? (
            <MensajeError error={f.error} />
          ) : (
            <>
              <div className="panel">
                <table className="tabla">
                  <tbody>
                    {f.data.festivos.map((x) => (
                      <tr key={x.fecha}>
                        <td className="w-36 whitespace-nowrap">{fechaISOCorta(x.fecha)}</td>
                        <td>{x.nombre}</td>
                        <td className="text-right text-[0.84rem] text-tinta-tenue">{x.origen === "AJUSTE" ? "Añadido manualmente" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {f.data.ajustes.some((a) => a.tipo === "QUITAR") && (
                <p className="mt-2 text-[0.88rem] text-tinta-suave">
                  Excluidos manualmente: {f.data.ajustes.filter((a) => a.tipo === "QUITAR").map((a) => a.fecha).join(", ")}
                </p>
              )}
              {esAdmin && <AjustesFestivos anio={anio} ajustes={f.data.ajustes} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Fila({ concepto, valor, nota }: { concepto: string; valor: string; nota?: string }) {
  return (
    <tr>
      <td>
        {concepto}
        {nota && <span className="block text-[0.82rem] text-tinta-tenue">{nota}</span>}
      </td>
      <td className="num font-semibold">{valor}</td>
    </tr>
  );
}

function AjustesFestivos({ anio, ajustes }: { anio: number; ajustes: Festivos["ajustes"] }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState<"AGREGAR" | "QUITAR">("AGREGAR");
  const [descripcion, setDescripcion] = useState("");
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["festivos", anio] });

  const guardar = useMutation({
    mutationFn: () => api("/config/festivos/ajustes", { body: { fecha, tipo, descripcion, motivo } }),
    onSuccess: () => {
      refrescar();
      setFecha("");
      setDescripcion("");
      setMotivo("");
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      aviso("Ajuste guardado. Recalcula el periodo afectado para aplicarlo a turnos ya cerrados.");
    },
  });
  const [motivo, setMotivo] = useState("");
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [motivoEliminar, setMotivoEliminar] = useState("");
  const borrar = useMutation({
    mutationFn: (f: string) => api(`/config/festivos/ajustes/${f}`, { method: "DELETE", body: { motivo: motivoEliminar } }),
    onSuccess: () => {
      refrescar();
      setEliminando(null);
      setMotivoEliminar("");
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      aviso("Ajuste eliminado");
    },
  });
  const [rango, setRango] = useState({ desde: `${anio}-01-01`, hasta: hoyLocal() });
  const recalcular = useMutation({
    mutationFn: () => api<{ diasRecalculados: number }>("/marcaciones/recalcular", { body: rango }),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      aviso(`Liquidación recalculada en ${r.diasRecalculados} días-empleado`);
    },
  });

  return (
    <div className="mt-6 space-y-6">
      <form
        className="rounded-[10px] border border-linea bg-superficie p-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <h3 className="font-bold">Ajustar el calendario</h3>
        <p className="mb-3 text-[0.9rem] text-tinta-suave">Para días cívicos decretados o festivos que una sentencia deje sin efecto.</p>
        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo de ajuste">
            <option value="AGREGAR">Añadir festivo</option>
            <option value="QUITAR">Quitar festivo</option>
          </select>
          <input type="date" required className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha" />
          <input className="campo" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-label="Descripción" />
        </div>
        <input
          required
          minLength={5}
          className="campo mt-3"
          placeholder="Motivo (p. ej. decreto, sentencia, acuerdo)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-label="Motivo del ajuste"
        />
        <MensajeError error={guardar.error} />
        <button className="btn btn-primario mt-3" disabled={guardar.isPending}>
          Guardar ajuste
        </button>
      </form>
        {ajustes.length > 0 && (
          <ul className="divide-y divide-linea rounded-[10px] border border-linea bg-superficie px-4 text-[0.92rem]">
            {ajustes.map((a) => (
              <li key={a.fecha} className="flex items-center justify-between py-2">
                <span>
                  <span className="tabular-nums">{a.fecha}</span>
                  <span className="ml-3 text-tinta-suave">
                    {a.tipo === "AGREGAR" ? "Añadido" : "Quitado"}
                    {a.descripcion ? `: ${a.descripcion}` : ""}
                  </span>
                </span>
                {eliminando === a.fecha ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      borrar.mutate(a.fecha);
                    }}
                  >
                    <input autoFocus required minLength={5} className="campo h-8 w-56" placeholder="Motivo" value={motivoEliminar} onChange={(e) => setMotivoEliminar(e.target.value)} aria-label="Motivo para eliminar el ajuste" />
                    <button className="btn btn-peligro h-8" disabled={borrar.isPending}>Eliminar</button>
                    <button type="button" className="btn btn-fantasma h-8" onClick={() => setEliminando(null)}>Cancelar</button>
                  </form>
                ) : (
                  <button type="button" className="btn btn-fantasma h-7 px-2" onClick={() => setEliminando(a.fecha)}>
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      <MensajeError error={borrar.error} />
      <HistorialCambios entidad="festivo" />

      <form
        className="rounded-[10px] border border-linea bg-superficie p-4"
        onSubmit={(e) => {
          e.preventDefault();
          recalcular.mutate();
        }}
      >
        <h3 className="font-bold">Recalcular liquidaciones</h3>
        <p className="mb-3 text-[0.9rem] text-tinta-suave">
          Aplica a los turnos cerrados del rango los festivos y salarios actuales. Úsalo tras ajustar festivos o corregir un salario.
        </p>
        <div className="flex flex-wrap gap-3">
          <input type="date" className="campo w-40" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} aria-label="Desde" />
          <input type="date" className="campo w-40" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} aria-label="Hasta" />
          <button className="btn btn-secundario" disabled={recalcular.isPending}>
            {recalcular.isPending ? "Recalculando…" : "Recalcular"}
          </button>
        </div>
        <MensajeError error={recalcular.error} />
      </form>
    </div>
  );
}
