import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Link } from "react-router";
import { api, descargar } from "../lib/api";
import type { ReporteExtrasDiarias } from "../lib/tipos";
import { Cargando, MensajeError, Vacio } from "./ui";

const fmtDia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
/** "sábado, 03/10/2026", como en el reporte de nómina. */
const dia = (f: string) => fmtDia.format(new Date(`${f}T12:00:00-05:00`));
const h = (min: number) => (min / 60).toFixed(2);

/** Detalle por día de las horas extra de cada empleado, con exportación a Excel. */
export function ExtrasDiarias({ desde, hasta, empleadoId }: { desde: string; hasta: string; empleadoId: number | null }) {
  const consulta = `/reportes/extras-diarias?desde=${desde}&hasta=${hasta}${empleadoId ? `&empleadoId=${empleadoId}` : ""}`;
  const q = useQuery({ queryKey: ["extras-diarias", desde, hasta, empleadoId], queryFn: () => api<ReporteExtrasDiarias>(consulta) });

  if (q.isPending) return <Cargando />;
  if (q.error) return <MensajeError error={q.error} />;
  const { datos, totales } = q.data;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.92rem] text-tinta-suave">
          {totales.dias} {totales.dias === 1 ? "día" : "días"} con horas extra de {totales.empleados} {totales.empleados === 1 ? "empleado" : "empleados"}. Horas en decimales.
        </p>
        <button className="btn btn-secundario" disabled={!datos.length} onClick={() => descargar(`${consulta}&formato=xlsx`)}>
          <FileSpreadsheet size={16} /> Exportar a Excel
        </button>
      </div>
      <div className="panel overflow-x-auto">
        {datos.length === 0 ? (
          <Vacio titulo="No hay horas extra en este periodo" />
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Empleado</th>
                <th>Cédula</th>
                <th className="num">Hora ing.</th>
                <th className="num">Hora sal.</th>
                <th className="num">Ext. diurnas</th>
                <th className="num">Ext. nocturnas</th>
                <th className="num">Ext. festivos</th>
                <th className="num">Por aprobar</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((f) => (
                <tr key={f.marcacionId}>
                  <td className="whitespace-nowrap first-letter:uppercase">{dia(f.fecha)}</td>
                  <td className="font-semibold">{f.empleado}</td>
                  <td className="tabular-nums">{f.identificacion}</td>
                  <td className="num">{f.entrada}</td>
                  <td className="num whitespace-nowrap">
                    {f.salida ?? "—"}
                    {f.salidaAutomatica && (
                      <span className="ml-1.5 rounded bg-extra-claro px-1.5 py-0.5 text-[0.72rem] font-semibold text-extra-oscuro" title="Salida puesta por el sistema con la hora del horario">
                        Auto
                      </span>
                    )}
                  </td>
                  <Celda min={f.minDiurnas} />
                  <Celda min={f.minNocturnas} />
                  <Celda min={f.minFestivas} />
                  <td className="num">
                    {f.minPendientes ? (
                      <Link to={`/marcaciones?extras=PENDIENTE&desde=${f.fecha}&hasta=${f.fecha}&q=${f.identificacion}`} className="font-semibold text-extra-oscuro underline underline-offset-2">
                        {h(f.minPendientes)}
                      </Link>
                    ) : (
                      <span className="text-tinta-tenue">·</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={5} className="border-t border-linea-fuerte">Total</td>
                <td className="num border-t border-linea-fuerte">{h(totales.minDiurnas)}</td>
                <td className="num border-t border-linea-fuerte">{h(totales.minNocturnas)}</td>
                <td className="num border-t border-linea-fuerte">{h(totales.minFestivas)}</td>
                <td className="num border-t border-linea-fuerte text-extra-oscuro">{totales.minPendientes ? h(totales.minPendientes) : ""}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mt-3 text-[0.84rem] text-tinta-suave">
        Ext. festivos suma las extras diurnas y nocturnas en domingo o festivo. "Por aprobar" son extras calculadas que aún no se han aprobado y no están en las otras columnas.
      </p>
    </div>
  );
}

function Celda({ min }: { min: number }) {
  return <td className={`num ${min ? "font-semibold text-extra-oscuro" : "text-tinta-tenue"}`}>{h(min)}</td>;
}
