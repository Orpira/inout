import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { CintaJornada, LeyendaCinta } from "../componentes/CintaJornada";
import { Cargando, MensajeError } from "../componentes/ui";
import { api } from "../lib/api";
import { duracion, fechaISOCorta, fechaLarga, horasDecimales, hora, nombreCompleto, pesos } from "../lib/formato";
import type { Dashboard } from "../lib/tipos";

export default function Inicio() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard"), refetchInterval: 60_000 });
  if (q.isPending) return <Cargando />;
  if (q.error) return <MensajeError error={q.error} />;
  const d = q.data;
  const ahora = new Date();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[1.65rem] font-bold">{fechaLarga(`${d.hoy}T12:00:00-05:00`)}</h1>
        <p className="mt-1 text-tinta-suave">
          {d.esFestivoHoy ? `Festivo: ${d.esFestivoHoy}. Todas las horas de hoy llevan recargo del ${Math.round(d.parametros.recargoDominical * 100)} %.` : "Día hábil."}
        </p>
      </div>

      {/* Cifras del día y del mes */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-linea py-5 md:grid-cols-5">
        <Cifra titulo="En turno ahora" valor={`${d.presentes.length}`} detalle={`de ${d.empleadosActivos} empleados activos`} />
        <Cifra titulo="Entradas hoy" valor={`${d.entradasHoy}`} detalle={`${d.empleadosHoy} personas distintas`} />
        <Cifra
          titulo="Por revisar"
          valor={`${d.enRevision}`}
          detalle={d.enRevision ? <Link to="/marcaciones?estado=REVISION" className="font-semibold text-alerta underline-offset-2 hover:underline">Turnos sin salida</Link> : "Todo al día"}
          tono={d.enRevision ? "alerta" : undefined}
        />
        <Cifra titulo="Horas extra del mes" valor={horasDecimales(d.mes.minutosExtra)} unidad="h" detalle={`en ${d.mes.turnos} turnos cerrados`} tono="extra" />
        <Cifra titulo="Recargos y extras del mes" valor={pesos(d.mes.valor)} detalle="valor a liquidar" />
      </dl>

      <div className="grid gap-8 xl:grid-cols-[1.35fr_1fr]">
        {/* En turno */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-bold">En turno ahora</h2>
            <LeyendaCinta />
          </div>
          <div className="panel">
            {d.presentes.length === 0 ? (
              <p className="px-5 py-10 text-center text-tinta-suave">Nadie tiene un turno abierto en este momento.</p>
            ) : (
              <ul>
                {d.presentes.map((m) => {
                  const min = Math.floor((ahora.getTime() - new Date(m.entrada).getTime()) / 60_000);
                  return (
                    <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-linea px-5 py-3.5 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{nombreCompleto(m.empleado)}</p>
                        <p className="truncate text-[0.86rem] text-tinta-tenue">{m.empleado.cargo ?? "Sin cargo"}</p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-semibold">{duracion(min)}</p>
                        <p className="text-[0.86rem] text-tinta-tenue">desde las {hora(m.entrada)}</p>
                      </div>
                      <div className="col-span-2">
                        <CintaJornada entrada={m.entrada} salida={null} variante="compacta" ahora={ahora} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Tendencia */}
        <section className="space-y-8">
          <div>
            <h2 className="mb-3 text-lg font-bold">Horas trabajadas, últimos 14 días</h2>
            <div className="panel p-5">
              <GraficoDias serie={d.serie} />
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-lg font-bold">Más horas extra este mes</h2>
            <div className="panel">
              {d.topExtras.filter((t) => t.minutosExtra > 0).length === 0 ? (
                <p className="px-5 py-8 text-center text-tinta-suave">Aún no hay horas extra este mes.</p>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="num">Horas extra</th>
                      <th className="num">Recargos y extras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topExtras
                      .filter((t) => t.minutosExtra > 0)
                      .map((t) => (
                        <tr key={t.empleadoId}>
                          <td className="font-medium">{t.nombre}</td>
                          <td className="num font-semibold text-extra-oscuro">{horasDecimales(t.minutosExtra)} h</td>
                          <td className="num text-tinta-suave">{pesos(t.valor)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Normas vigentes */}
      <section className="grid gap-6 border-t border-linea pt-6 text-[0.92rem] md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-bold">Reglas que se están aplicando hoy</h2>
          <ul className="space-y-1 text-tinta-suave">
            <li>
              Jornada máxima de <strong className="text-tinta">{d.parametros.jornadaSemanal} h</strong> semanales; valor hora = salario ÷{" "}
              {d.parametros.divisorMensual}.
            </li>
            <li>
              Franja nocturna de <strong className="text-tinta">{d.parametros.inicioNocturno}</strong> a 06:00 con recargo del 35 %.
            </li>
            <li>
              Recargo dominical y festivo del <strong className="text-tinta">{Math.round(d.parametros.recargoDominical * 100)} %</strong>.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-bold">Próximos festivos</h2>
          <ul className="space-y-1 text-tinta-suave">
            {d.proximosFestivos.map((f) => (
              <li key={f.fecha}>
                <span className="inline-block w-28 font-medium text-tinta">{fechaISOCorta(f.fecha)}</span>
                {f.nombre}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  unidad,
  detalle,
  tono,
}: {
  titulo: string;
  valor: string;
  unidad?: string;
  detalle?: React.ReactNode;
  tono?: "alerta" | "extra";
}) {
  const color = tono === "alerta" ? "text-alerta" : tono === "extra" ? "text-extra-oscuro" : "text-tinta";
  return (
    <div>
      <dt className="text-[0.86rem] font-medium text-tinta-suave">{titulo}</dt>
      <dd className={`cifra mt-0.5 text-[2rem] font-bold leading-tight ${color}`}>
        {valor}
        {unidad && <span className="ml-1 text-[1.1rem] font-semibold">{unidad}</span>}
      </dd>
      {detalle && <dd className="text-[0.84rem] text-tinta-tenue">{detalle}</dd>}
    </div>
  );
}

function GraficoDias({ serie }: { serie: Dashboard["serie"] }) {
  const max = Math.max(60, ...serie.map((s) => s.minutosTotales));
  const alto = 140;
  return (
    <div>
      <p className="mb-2 text-[0.78rem] text-tinta-tenue tabular-nums">{horasDecimales(max)} h</p>
      <div className="flex h-[140px] items-end gap-1.5 border-b border-linea" role="img" aria-label="Horas ordinarias y extra por día">
        {serie.map((s) => {
          const total = (s.minutosTotales / max) * alto;
          const extra = (s.minutosExtra / max) * alto;
          const dom = new Date(`${s.fecha}T12:00:00-05:00`).getUTCDay() === 0;
          return (
            <div key={s.fecha} className="group relative flex flex-1 flex-col justify-end" style={{ height: alto }}>
              <div className="rounded-t-[3px] bg-extra" style={{ height: extra }} />
              <div className="bg-petroleo/85" style={{ height: Math.max(total - extra, 0) }} />
              {(s.festivo || dom) && <div className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-noche" />}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 rounded bg-tinta px-2 py-1 text-[0.78rem] text-white group-hover:block">
                {fechaISOCorta(s.fecha)}: {horasDecimales(s.minutosTotales)} h, {horasDecimales(s.minutosExtra)} h extra
                {s.festivo ? ` (${s.festivo})` : ""}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-[0.78rem] text-tinta-tenue tabular-nums">
        <span>{fechaISOCorta(serie[0]!.fecha)}</span>
        <span>Hoy</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem] text-tinta-suave">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-petroleo/85" /> Ordinarias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-extra" /> Extra
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-noche" /> Domingo o festivo
        </span>
      </div>
    </div>
  );
}
