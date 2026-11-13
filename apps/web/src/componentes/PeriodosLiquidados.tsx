import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { fechaCorta, fechaISOCorta, hora, horasDecimales, pesos } from "../lib/formato";
import type { PendientesPeriodo, PeriodoLiquidado, ReporteLiquidacion } from "../lib/tipos";
import { Dialogo, MensajeError, useAviso } from "./ui";

const rango = (p: { desde: string; hasta: string }) => `${fechaISOCorta(p.desde)} al ${fechaISOCorta(p.hasta)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Franja({ tono, icono, children }: { tono: "consulta" | "alerta" | "pendiente"; icono: ReactNode; children: ReactNode }) {
  const clase = {
    consulta: "border-petroleo/25 bg-petroleo-claro text-petroleo-oscuro",
    alerta: "border-alerta/30 bg-alerta-claro text-alerta",
    pendiente: "border-extra/40 bg-extra-claro text-extra-oscuro",
  }[tono];
  return (
    <div role={tono === "consulta" ? "status" : "alert"} className={`mb-4 flex gap-3 rounded-md border px-4 py-3 text-[0.93rem] ${clase}`}>
      <span className="mt-0.5 shrink-0">{icono}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Lo que falta por resolver en el rango: nada de esto está en los valores ni en el CSV. */
export function AvisoPendientes({ pendientes, desde, hasta }: { pendientes: PendientesPeriodo; desde: string; hasta: string }) {
  if (!pendientes.total) return null;
  const q = `desde=${desde}&hasta=${hasta}`;
  const items: [number, string, string][] = [
    [pendientes.porRevisar, plural(pendientes.porRevisar, "turno por revisar", "turnos por revisar"), `/marcaciones?estado=REVISION&${q}`],
    [pendientes.enTurno, plural(pendientes.enTurno, "turno sin cerrar", "turnos sin cerrar"), `/marcaciones?estado=ABIERTA&${q}`],
    [pendientes.extrasPorAprobar, plural(pendientes.extrasPorAprobar, "turno con horas extra por aprobar", "turnos con horas extra por aprobar"), `/marcaciones?extras=PENDIENTE&${q}`],
    [pendientes.offlineSinResolver, plural(pendientes.offlineSinResolver, "marcación sin conexión por resolver", "marcaciones sin conexión por resolver"), `/marcaciones?${q}`],
  ];
  return (
    <Franja tono="pendiente" icono={<TriangleAlert size={18} />}>
      <p className="font-semibold">Hay registros de este periodo que no están incluidos en la liquidación</p>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
        {items
          .filter(([n]) => n > 0)
          .map(([, texto, ruta]) => (
            <li key={ruta}>
              <Link to={ruta} className="font-semibold underline underline-offset-2">
                {texto}
              </Link>
            </li>
          ))}
      </ul>
      <p className="mt-1">Si se paga sin resolverlos, esas horas quedan sin liquidar. El periodo no se puede cerrar hasta entonces.</p>
    </Franja>
  );
}

/** Estado de cierre del rango consultado: liquidado (solo consulta) o mezclado con días ya liquidados. */
export function AvisoCierre({
  cierre,
  periodos,
  hasta,
  esAdmin,
  onVerSinLiquidar,
  onReabrir,
}: {
  cierre: ReporteLiquidacion["cierre"];
  periodos: PeriodoLiquidado[];
  hasta: string;
  esAdmin: boolean;
  onVerSinLiquidar: (desde: string) => void;
  onReabrir: (p: PeriodoLiquidado) => void;
}) {
  if (cierre.estado === "ABIERTO") return null;
  const detalle = cierre.periodos.map((c) => periodos.find((p) => p.id === c.id)).filter((p): p is PeriodoLiquidado => !!p);

  if (cierre.estado === "LIQUIDADO") {
    return (
      <Franja tono="consulta" icono={<Lock size={18} />}>
        <p className="font-semibold">Periodo liquidado: solo consulta</p>
        <ul className="mt-1 space-y-1">
          {detalle.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {rango(p)}. Cerrado el {fechaCorta(p.cerradoEn)}
                {p.cerradoPorNombre ? ` por ${p.cerradoPorNombre}` : ""}
                {p.nota ? `. ${p.nota}` : ""}
              </span>
              {esAdmin && (
                <button className="font-semibold underline underline-offset-2" onClick={() => onReabrir(p)}>
                  Reabrir
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-1">Las marcaciones de estas fechas no se pueden crear, corregir, anular ni recalcular.</p>
      </Franja>
    );
  }

  const ultimo = cierre.periodos[cierre.periodos.length - 1]!;
  const siguiente = new Date(`${ultimo.hasta}T12:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const desdeLibre = siguiente.toISOString().slice(0, 10);
  return (
    <Franja tono="alerta" icono={<TriangleAlert size={18} />}>
      <p className="font-semibold">Este rango incluye días que ya se liquidaron</p>
      <p className="mt-1">
        Ya liquidado: {cierre.periodos.map(rango).join("; ")}. Para no pagar dos veces, con este rango no se puede descargar el CSV ni cerrar el periodo.
      </p>
      {desdeLibre <= hasta && (
        <button className="mt-1.5 font-semibold underline underline-offset-2" onClick={() => onVerSinLiquidar(desdeLibre)}>
          Ver solo los días sin liquidar (desde el {fechaISOCorta(desdeLibre)})
        </button>
      )}
    </Franja>
  );
}

function useRefrescar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["liquidacion"] });
    void qc.invalidateQueries({ queryKey: ["periodos"] });
  };
}

export function DialogoCerrarPeriodo({ reporte, onCerrar }: { reporte: ReporteLiquidacion | null; onCerrar: () => void }) {
  const [nota, setNota] = useState("");
  const aviso = useAviso();
  const refrescar = useRefrescar();
  const m = useMutation({
    mutationFn: () => api("/periodos", { body: { desde: reporte!.desde, hasta: reporte!.hasta, nota: nota.trim() || null } }),
    onSuccess: () => {
      refrescar();
      aviso("Periodo cerrado. Ahora es de solo consulta.");
      setNota("");
      onCerrar();
    },
  });
  const cerrar = () => {
    m.reset();
    onCerrar();
  };
  return (
    <Dialogo abierto={!!reporte} onCerrar={cerrar} titulo="Cerrar periodo liquidado">
      {reporte && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md bg-papel px-4 py-3">
            <div className="col-span-2">
              <dt className="text-[0.82rem] font-medium text-tinta-suave">Periodo</dt>
              <dd className="font-semibold">{rango(reporte)}</dd>
            </div>
            <div>
              <dt className="text-[0.82rem] font-medium text-tinta-suave">Empleados y turnos</dt>
              <dd className="font-semibold tabular-nums">
                {reporte.totales.empleados} · {reporte.totales.turnos}
              </dd>
            </div>
            <div>
              <dt className="text-[0.82rem] font-medium text-tinta-suave">Total liquidado</dt>
              <dd className="font-semibold tabular-nums">{pesos(reporte.totales.valorTotal)}</dd>
            </div>
          </dl>
          <p className="text-[0.93rem] text-tinta-suave">
            Al cerrar, las marcaciones de estas fechas quedan de solo consulta: no se podrán crear, corregir, anular, aprobar ni recalcular, y estos días no se podrán
            incluir en otra liquidación. Si después hay que corregir algo, un administrador puede reabrir el periodo indicando el motivo.
          </p>
          <div>
            <label className="etiqueta" htmlFor="cp-nota">Nota (opcional)</label>
            <input id="cp-nota" className="campo" maxLength={500} placeholder="Ej.: nómina de la primera quincena de noviembre" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <MensajeError error={m.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
            <button className="btn btn-primario" disabled={m.isPending}>
              <Lock size={16} /> Cerrar periodo
            </button>
          </div>
        </form>
      )}
    </Dialogo>
  );
}

export function DialogoReabrirPeriodo({ periodo, onCerrar }: { periodo: PeriodoLiquidado | null; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const aviso = useAviso();
  const refrescar = useRefrescar();
  const m = useMutation({
    mutationFn: () => api(`/periodos/${periodo!.id}/reabrir`, { body: { motivo } }),
    onSuccess: () => {
      refrescar();
      aviso("Periodo reabierto. Corrige lo necesario y vuelve a cerrarlo.");
      setMotivo("");
      onCerrar();
    },
  });
  const cerrar = () => {
    m.reset();
    onCerrar();
  };
  return (
    <Dialogo abierto={!!periodo} onCerrar={cerrar} titulo="Reabrir periodo liquidado">
      {periodo && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <p>
            <span className="font-semibold">{rango(periodo)}</span>, liquidado por <span className="font-semibold tabular-nums">{pesos(periodo.resumen.valorTotal)}</span>.
          </p>
          <p className="text-[0.93rem] text-tinta-suave">
            Al reabrir se podrán volver a modificar las marcaciones de estas fechas y habrá que cerrar el periodo de nuevo. Esta liquidación se conserva en el
            historial, con su total y el motivo, para compararla con la nueva.
          </p>
          <div>
            <label className="etiqueta" htmlFor="rp-motivo">Motivo de la reapertura</label>
            <textarea
              id="rp-motivo"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              className="campo"
              placeholder="Ej.: faltó registrar las horas extra del día 12 de un empleado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <MensajeError error={m.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
            <button className="btn btn-peligro" disabled={m.isPending || motivo.trim().length < 5}>
              <LockOpen size={16} /> Reabrir periodo
            </button>
          </div>
        </form>
      )}
    </Dialogo>
  );
}

/** Historial de liquidaciones: los cierres vigentes y los que se reabrieron, con su motivo. */
export function HistorialPeriodos({
  periodos,
  esAdmin,
  onVer,
  onReabrir,
}: {
  periodos: PeriodoLiquidado[];
  esAdmin: boolean;
  onVer: (p: PeriodoLiquidado) => void;
  onReabrir: (p: PeriodoLiquidado) => void;
}) {
  const [detalle, setDetalle] = useState<PeriodoLiquidado | null>(null);
  if (!periodos.length) return null;
  // Liquidación anterior de los mismos días (la que se reabrió por última vez antes de este cierre).
  const anterior = (p: PeriodoLiquidado) =>
    periodos
      .filter((x) => x.id !== p.id && !x.vigente && x.desde <= p.hasta && x.hasta >= p.desde && x.cerradoEn < p.cerradoEn)
      .sort((a, b) => b.cerradoEn.localeCompare(a.cerradoEn))[0];
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">Historial de liquidaciones</h2>
      <p className="mb-3 mt-0.5 max-w-[70ch] text-[0.93rem] text-tinta-suave">
        Cada cierre de periodo queda registrado. Si un periodo se reabrió, la liquidación anterior se conserva con el motivo.
      </p>
      <div className="panel overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Periodo</th>
              <th className="num">Turnos</th>
              <th className="num">Total liquidado</th>
              <th>Cierre</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => {
              const prev = anterior(p);
              const dif = prev ? p.resumen.valorTotal - prev.resumen.valorTotal : 0;
              return (
                <tr key={p.id} className={p.vigente ? "" : "text-tinta-suave"}>
                  <td className="whitespace-nowrap font-semibold">{rango(p)}</td>
                  <td className="num">{p.resumen.turnos}</td>
                  <td className="num whitespace-nowrap">
                    <span className="font-semibold">{pesos(p.resumen.valorTotal)}</span>
                    {prev && (
                      <span className="block text-[0.8rem] font-normal text-tinta-tenue">
                        {dif === 0 ? "igual que la anterior" : `${dif > 0 ? "+" : "−"}${pesos(Math.abs(dif))} frente a la anterior`}
                      </span>
                    )}
                  </td>
                  <td>
                    {fechaCorta(p.cerradoEn)}, {hora(p.cerradoEn)}
                    {p.cerradoPorNombre ? ` · ${p.cerradoPorNombre}` : ""}
                    {p.nota && <span className="block text-[0.82rem] text-tinta-tenue">{p.nota}</span>}
                  </td>
                  <td className="max-w-[34ch]">
                    {p.vigente ? (
                      <span className="inline-flex items-center gap-1 rounded bg-petroleo-claro px-2 py-0.5 text-[0.8rem] font-semibold text-petroleo-oscuro">
                        <Lock size={12} /> Liquidado
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex rounded bg-papel px-2 py-0.5 text-[0.8rem] font-semibold">Reabierto</span>
                        <span className="mt-0.5 block text-[0.82rem]">
                          {p.reabiertoEn ? `${fechaCorta(p.reabiertoEn)}, ${hora(p.reabiertoEn)}` : ""}
                          {p.reabiertoPorNombre ? ` · ${p.reabiertoPorNombre}` : ""}: {p.motivoReapertura}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-fantasma h-8" onClick={() => setDetalle(p)}>
                      Detalle
                    </button>
                    {p.vigente && (
                      <button className="btn btn-fantasma h-8" onClick={() => onVer(p)}>
                        Consultar
                      </button>
                    )}
                    {p.vigente && esAdmin && (
                      <button className="btn btn-fantasma h-8" onClick={() => onReabrir(p)}>
                        Reabrir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialogo abierto={!!detalle} onCerrar={() => setDetalle(null)} titulo="Liquidación registrada" ancho="max-w-2xl">
        {detalle && (
          <>
            <p className="mb-3 text-[0.93rem] text-tinta-suave">
              {rango(detalle)}. Valores tal como quedaron al cerrar el {fechaCorta(detalle.cerradoEn)}
              {detalle.vigente ? "." : "; este cierre se reabrió después."}
            </p>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th className="num">Turnos</th>
                  <th className="num">Horas</th>
                  <th className="num">Horas extra</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {detalle.detalle.map((f) => (
                  <tr key={f.empleadoId}>
                    <td>
                      {f.nombre} <span className="text-[0.82rem] tabular-nums text-tinta-tenue">{f.identificacion}</span>
                    </td>
                    <td className="num">{f.turnos}</td>
                    <td className="num">{horasDecimales(f.minutosTotales)}</td>
                    <td className="num">{horasDecimales(f.minutosExtra)}</td>
                    <td className="num font-semibold">{pesos(f.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="border-t border-linea-fuerte">Total</td>
                  <td className="num border-t border-linea-fuerte">{detalle.resumen.turnos}</td>
                  <td className="num border-t border-linea-fuerte">{horasDecimales(detalle.resumen.minutosTotales)}</td>
                  <td className="num border-t border-linea-fuerte">{horasDecimales(detalle.resumen.minutosExtra)}</td>
                  <td className="num border-t border-linea-fuerte">{pesos(detalle.resumen.valorTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </Dialogo>
    </section>
  );
}
