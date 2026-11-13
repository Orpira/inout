import { ETIQUETAS, sumarDias, type Categoria } from "@inout/core";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { SelectorEmpleado } from "../componentes/SelectorEmpleado";
import { Cargando, Encabezado, MensajeError, Vacio } from "../componentes/ui";
import { api, descargar } from "../lib/api";
import { fechaISOCorta, horasDecimales, hoyLocal, nombreCompleto, pesos } from "../lib/formato";
import type { Empleado, ReporteLiquidacion } from "../lib/tipos";

const RECARGOS: Categoria[] = ["ORD_NOCTURNA", "ORD_DIURNA_DF", "ORD_NOCTURNA_DF"];
const EXTRAS: Categoria[] = ["EXT_DIURNA", "EXT_NOCTURNA", "EXT_DIURNA_DF", "EXT_NOCTURNA_DF"];

function periodos() {
  const hoy = hoyLocal();
  const mes = hoy.slice(0, 7);
  const finMes = sumarDias(`${sumarDias(`${mes}-28`, 4).slice(0, 7)}-01`, -1);
  const inicioAnterior = `${sumarDias(`${mes}-01`, -1).slice(0, 7)}-01`;
  return [
    { id: "q1", texto: "1.ª quincena", desde: `${mes}-01`, hasta: `${mes}-15` },
    { id: "q2", texto: "2.ª quincena", desde: `${mes}-16`, hasta: finMes },
    { id: "mes", texto: "Este mes", desde: `${mes}-01`, hasta: finMes },
    { id: "ant", texto: "Mes anterior", desde: inicioAnterior, hasta: sumarDias(`${mes}-01`, -1) },
  ];
}

export default function Liquidacion() {
  const ps = periodos();
  const [rango, setRango] = useState({ desde: ps[2]!.desde, hasta: ps[2]!.hasta });
  const [empleadoId, setEmpleadoId] = useState<number | null>(null);
  // Incluye inactivos: alguien dado de baja puede tener turnos por liquidar en el periodo.
  const emps = useQuery({ queryKey: ["empleados", "todos"], queryFn: () => api<{ datos: Empleado[] }>("/empleados?estado=todos") });
  const empleado = emps.data?.datos.find((e) => e.id === empleadoId);
  const consulta = `/reportes/liquidacion?desde=${rango.desde}&hasta=${rango.hasta}${empleadoId ? `&empleadoId=${empleadoId}` : ""}`;
  const q = useQuery({
    queryKey: ["liquidacion", rango, empleadoId],
    queryFn: () => api<ReporteLiquidacion>(consulta),
  });

  return (
    <div>
      <Encabezado
        titulo="Liquidación de recargos y horas extra"
        descripcion="Valores a pagar adicionales al salario, por empleado, para los turnos cerrados del periodo. Los turnos por revisar y las horas extra sin aprobar no se incluyen hasta que se resuelvan."
        acciones={
          <button
            className="btn btn-secundario"
            title={empleado ? `Solo ${nombreCompleto(empleado)}` : "Todos los empleados del periodo"}
            onClick={() => descargar(`${consulta}&formato=csv`)}
          >
            <Download size={16} /> Descargar para nómina (CSV)
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border border-linea-fuerte bg-superficie p-1" role="group" aria-label="Periodos rápidos">
          {ps.map((p) => {
            const activo = p.desde === rango.desde && p.hasta === rango.hasta;
            return (
              <button
                key={p.id}
                aria-pressed={activo}
                onClick={() => setRango({ desde: p.desde, hasta: p.hasta })}
                className={`h-7 rounded px-3 text-[0.9rem] font-medium ${activo ? "bg-petroleo text-white" : "text-tinta-suave hover:bg-papel"}`}
              >
                {p.texto}
              </button>
            );
          })}
        </div>
        <div>
          <label className="etiqueta" htmlFor="l-desde">Desde</label>
          <input id="l-desde" type="date" className="campo w-40" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="l-hasta">Hasta</label>
          <input id="l-hasta" type="date" className="campo w-40" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="l-emp">Empleado</label>
          <SelectorEmpleado id="l-emp" empleados={emps.data?.datos ?? []} valor={empleadoId} onCambiar={setEmpleadoId} cargando={emps.isPending} />
        </div>
      </div>

      {q.isPending ? (
        <Cargando />
      ) : q.error ? (
        <MensajeError error={q.error} />
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-6 border-y border-linea py-5 md:grid-cols-4">
            <div>
              <dt className="text-[0.86rem] font-medium text-tinta-suave">Periodo</dt>
              <dd className="mt-1 text-lg font-semibold">
                {fechaISOCorta(q.data.desde)} al {fechaISOCorta(q.data.hasta)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.86rem] font-medium text-tinta-suave">Horas trabajadas</dt>
              <dd className="cifra text-[1.8rem] font-bold">{horasDecimales(q.data.totales.minutosTotales)} h</dd>
            </div>
            <div>
              <dt className="text-[0.86rem] font-medium text-tinta-suave">Horas extra liquidadas</dt>
              <dd className="cifra text-[1.8rem] font-bold text-extra-oscuro">{horasDecimales(q.data.totales.minutosExtra)} h</dd>
              {q.data.totales.minutosExtraPendientes > 0 && (
                <dd className="text-[0.86rem]">
                  <Link to={`/marcaciones?extras=PENDIENTE&desde=${rango.desde}&hasta=${rango.hasta}`} className="font-semibold text-extra-oscuro underline underline-offset-2">
                    {horasDecimales(q.data.totales.minutosExtraPendientes)} h más por aprobar
                  </Link>
                </dd>
              )}
            </div>
            <div>
              <dt className="text-[0.86rem] font-medium text-tinta-suave">Total a liquidar</dt>
              <dd className="cifra text-[1.8rem] font-bold">{pesos(q.data.totales.valorTotal)}</dd>
            </div>
          </dl>

          <div className="panel overflow-x-auto">
            {q.data.datos.length === 0 ? (
              <Vacio titulo={empleado ? `${nombreCompleto(empleado)} no tiene turnos cerrados en este periodo` : "No hay turnos cerrados en este periodo"} />
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th rowSpan={2}>Empleado</th>
                    <th rowSpan={2} className="num">Turnos</th>
                    <th rowSpan={2} className="num">Horas</th>
                    <th colSpan={RECARGOS.length} className="border-l border-linea text-center">Recargos sobre horas ordinarias</th>
                    <th colSpan={EXTRAS.length} className="border-l border-linea text-center text-extra-oscuro">Horas extra</th>
                    <th rowSpan={2} className="num border-l border-linea">Total</th>
                  </tr>
                  <tr>
                    {[...RECARGOS, ...EXTRAS].map((c, i) => (
                      <th key={c} className={`num ${i === 0 || i === RECARGOS.length ? "border-l border-linea" : ""}`} title={ETIQUETAS[c].larga}>
                        {ETIQUETAS[c].corta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.data.datos.map((f) => (
                    <tr key={f.empleadoId}>
                      <td>
                        <p className="font-semibold">{f.nombre}</p>
                        <p className="text-[0.82rem] text-tinta-tenue tabular-nums">{f.identificacion}</p>
                        {f.minutosExtraPendientes > 0 && (
                          <p className="text-[0.82rem] font-medium text-extra-oscuro">{horasDecimales(f.minutosExtraPendientes)} h extra por aprobar</p>
                        )}
                        {f.alertas.map((a) => (
                          <p key={a} className="text-[0.82rem] text-alerta">{a}</p>
                        ))}
                      </td>
                      <td className="num">{f.turnos}</td>
                      <td className="num">{horasDecimales(f.minutosTotales)}</td>
                      {[...RECARGOS, ...EXTRAS].map((c, i) => (
                        <CeldaCategoria key={c} v={f.categorias[c]} borde={i === 0 || i === RECARGOS.length} extra={EXTRAS.includes(c)} />
                      ))}
                      <td className="num border-l border-linea font-bold">{pesos(f.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className="border-t border-linea-fuerte">Total</td>
                    <td className="num border-t border-linea-fuerte">{q.data.totales.turnos}</td>
                    <td className="num border-t border-linea-fuerte">{horasDecimales(q.data.totales.minutosTotales)}</td>
                    {[...RECARGOS, ...EXTRAS].map((c, i) => (
                      <CeldaCategoria key={c} v={q.data.totales.categorias[c]} borde={i === 0 || i === RECARGOS.length} extra={EXTRAS.includes(c)} pie />
                    ))}
                    <td className="num border-l border-t border-linea border-t-linea-fuerte">{pesos(q.data.totales.valorTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-1 text-[0.84rem] text-tinta-suave sm:grid-cols-2 lg:grid-cols-4">
            {[...RECARGOS, ...EXTRAS].map((c) => (
              <div key={c}>
                <dt className="inline font-semibold text-tinta">{ETIQUETAS[c].corta}</dt> <dd className="inline">{ETIQUETAS[c].larga}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function CeldaCategoria({ v, borde, extra, pie }: { v?: { minutos: number; valor: number }; borde: boolean; extra: boolean; pie?: boolean }) {
  const clase = `num whitespace-nowrap ${borde ? "border-l border-linea" : ""} ${pie ? "border-t border-t-linea-fuerte" : ""}`;
  if (!v || !v.minutos) return <td className={`${clase} text-tinta-tenue`}>·</td>;
  return (
    <td className={clase}>
      <span className={extra ? "font-semibold text-extra-oscuro" : ""}>{horasDecimales(v.minutos)} h</span>
      <span className="block text-[0.8rem] font-normal text-tinta-tenue">{pesos(v.valor)}</span>
    </td>
  );
}
