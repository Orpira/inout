import { fechaLocal, minutosHorarioFijo, NOMBRES_DIAS, validarHorario, type Descanso, type Horario as HorarioCore } from "@inout/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Cargando, Dialogo, Encabezado, MensajeError, useAviso, Vacio } from "../componentes/ui";
import { api } from "../lib/api";
import { duracion, horasDecimales } from "../lib/formato";
import { useSesion } from "../lib/sesion";
import type { Horario } from "../lib/tipos";

const INICIALES = ["D", "L", "M", "X", "J", "V", "S"];
/** Lunes primero, como se lee una semana laboral. */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

function resumenDias(h: HorarioCore) {
  return ORDEN.map((i) => (h.dias[i]?.laborable ? INICIALES[i] : null)).filter(Boolean).join(" ");
}
function resumenDescanso(d: Descanso | null) {
  if (!d) return "Sin descanso descontado";
  return d.tipo === "VENTANA" ? `${d.inicio} a ${d.fin}` : `${d.minutos} min tras ${horasDecimales(d.despuesDe)} h`;
}

export default function Horarios() {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "ADMIN";
  const [editando, setEditando] = useState<Horario | "nuevo" | null>(null);
  const q = useQuery({ queryKey: ["horarios"], queryFn: () => api<{ datos: Horario[] }>("/horarios") });

  return (
    <div>
      <Encabezado
        titulo="Horarios"
        descripcion="Cada grupo de empleados tiene su jornada ordinaria. Lo que se trabaje por encima de ella, o en un día no laborable del horario, se liquida como hora extra."
        acciones={
          esAdmin && (
            <button className="btn btn-primario" onClick={() => setEditando("nuevo")}>
              <Plus size={16} /> Crear horario
            </button>
          )
        }
      />
      <div className="panel overflow-x-auto">
        {q.isPending ? (
          <Cargando />
        ) : q.error ? (
          <div className="p-4">
            <MensajeError error={q.error} />
          </div>
        ) : q.data.datos.length === 0 ? (
          <Vacio titulo="Aún no hay horarios">
            Crea uno para el personal administrativo y otro para bodega. Mientras tanto se aplica la jornada legal de lunes a sábado.
          </Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Horario</th>
                <th>Días</th>
                <th className="num">Horas por semana</th>
                <th>Descanso no remunerado</th>
                <th>Horas extra</th>
                <th className="num">Empleados</th>
              </tr>
            </thead>
            <tbody>
              {q.data.datos.map((h) => (
                <tr key={h.id} className={esAdmin ? "cursor-pointer" : ""} onClick={() => esAdmin && setEditando(h)}>
                  <td>
                    <p className="font-semibold">{h.nombre}</p>
                    <p className="text-[0.84rem] text-tinta-tenue">{h.tipo === "FIJO" ? "Horario fijo" : "Turnos"}{!h.activo && ", inactivo"}</p>
                  </td>
                  <td className="whitespace-nowrap tracking-wide">{resumenDias(h)}</td>
                  <td className="num">
                    <span className={h.validacion?.errores.length ? "font-semibold text-alerta" : ""}>{horasDecimales(h.validacion?.minutosSemana ?? 0)} h</span>
                    <span className="block text-[0.8rem] text-tinta-tenue">máx. legal {h.validacion?.jornadaLegalHoras} h</span>
                  </td>
                  <td className="text-tinta-suave">{resumenDescanso(h.descanso)}</td>
                  <td>
                    {h.requiereAprobacion ? "Requieren aprobación" : "Se liquidan automáticamente"}
                    {h.toleranciaMinutos > 0 && <span className="block text-[0.84rem] text-tinta-tenue">Tolerancia {h.toleranciaMinutos} min</span>}
                  </td>
                  <td className="num">{h.empleados ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {q.data?.datos.some((h) => h.validacion?.errores.length) && (
        <p className="mt-3 text-[0.92rem] text-alerta">
          Algún horario supera la jornada legal vigente. Ajústalo para que las horas sobrantes se liquiden como extra.
        </p>
      )}

      <Dialogo abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nuevo" ? "Crear horario" : "Editar horario"} ancho="max-w-3xl">
        {editando !== null && <FormHorario h={editando === "nuevo" ? null : editando} onListo={() => setEditando(null)} />}
      </Dialogo>
    </div>
  );
}

interface DiaForm {
  laborable: boolean;
  inicio: string;
  fin: string;
  horas: string;
}

function FormHorario({ h, onListo }: { h: Horario | null; onListo: () => void }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [nombre, setNombre] = useState(h?.nombre ?? "");
  const [tipo, setTipo] = useState<"FIJO" | "TURNOS">(h?.tipo ?? "FIJO");
  const [dias, setDias] = useState<DiaForm[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = h?.dias[i];
      return {
        laborable: d?.laborable ?? (i >= 1 && i <= 5),
        inicio: d?.inicio ?? "08:00",
        fin: d?.fin ?? "17:00",
        horas: d?.laborable && d.minutos ? String(d.minutos / 60).replace(".", ",") : "7",
      };
    }),
  );
  const [descTipo, setDescTipo] = useState<"NINGUNO" | "VENTANA" | "DURACION">(h ? (h.descanso?.tipo ?? "NINGUNO") : "VENTANA");
  const [vInicio, setVInicio] = useState(h?.descanso?.tipo === "VENTANA" ? h.descanso.inicio : "12:00");
  const [vFin, setVFin] = useState(h?.descanso?.tipo === "VENTANA" ? h.descanso.fin : "13:00");
  const [dMin, setDMin] = useState(h?.descanso?.tipo === "DURACION" ? String(h.descanso.minutos) : "30");
  const [dDespues, setDDespues] = useState(h?.descanso?.tipo === "DURACION" ? String(h.descanso.despuesDe / 60).replace(".", ",") : "4");
  const [tolerancia, setTolerancia] = useState(String(h?.toleranciaMinutos ?? 0));
  const [aprobacion, setAprobacion] = useState(h?.requiereAprobacion ?? true);
  const [activo, setActivo] = useState(h?.activo ?? true);

  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const descanso: Descanso | null =
    descTipo === "VENTANA"
      ? { tipo: "VENTANA", inicio: vInicio, fin: vFin }
      : descTipo === "DURACION"
        ? { tipo: "DURACION", minutos: Math.round(num(dMin)), despuesDe: Math.round(num(dDespues) * 60) }
        : null;

  const horario: HorarioCore = useMemo(
    () => ({
      tipo,
      descanso,
      toleranciaMinutos: Math.round(num(tolerancia)),
      requiereAprobacion: aprobacion,
      dias: dias.map((d) =>
        !d.laborable
          ? { laborable: false, minutos: 0 }
          : tipo === "FIJO"
            ? { laborable: true, inicio: d.inicio, fin: d.fin, minutos: minutosHorarioFijo(d.inicio, d.fin, descanso) }
            : { laborable: true, minutos: Math.round(num(d.horas) * 60) },
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, dias, descTipo, vInicio, vFin, dMin, dDespues, tolerancia, aprobacion],
  );
  const v = validarHorario(horario, fechaLocal(new Date()));

  const mut = useMutation({
    mutationFn: () => {
      const body = { ...horario, nombre, activo };
      return h ? api(`/horarios/${h.id}`, { method: "PUT", body }) : api("/horarios", { body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["horarios"] });
      aviso(h ? "Horario guardado. Recalcula los periodos afectados en Festivos y normas si cambió la jornada." : "Horario creado");
      onListo();
    },
  });

  const cambiarDia = (i: number, c: Partial<DiaForm>) => setDias(dias.map((d, j) => (j === i ? { ...d, ...c } : d)));
  const copiarLunes = () => setDias(dias.map((d, i) => (i === 1 || !d.laborable ? d : { ...d, inicio: dias[1]!.inicio, fin: dias[1]!.fin, horas: dias[1]!.horas })));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="etiqueta" htmlFor="h-nombre">Nombre</label>
          <input id="h-nombre" required className="campo" placeholder="Ej.: Administrativo L-V" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <fieldset>
          <legend className="etiqueta">Tipo</legend>
          <div className="flex rounded-md border border-linea-fuerte p-0.5">
            {(
              [
                ["FIJO", "Horario fijo"],
                ["TURNOS", "Turnos"],
              ] as const
            ).map(([valor, texto]) => (
              <label key={valor} className={`cursor-pointer rounded px-3 py-1.5 text-[0.9rem] font-medium ${tipo === valor ? "bg-petroleo text-white" : "text-tinta-suave"}`}>
                <input type="radio" className="sr-only" name="tipo" checked={tipo === valor} onChange={() => setTipo(valor)} />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="-mt-2 text-[0.88rem] text-tinta-suave">
        {tipo === "FIJO"
          ? "Para personal administrativo: hora de entrada y salida fijas. Las horas ordinarias se calculan restando el descanso."
          : "Para personal operativo con turnos rotativos: indica cuántas horas ordinarias tiene cada día, empiece el turno a la hora que empiece."}
      </p>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-bold">Jornada por día</h3>
          <button type="button" className="btn btn-fantasma h-7 px-2 text-[0.85rem]" onClick={copiarLunes}>
            Copiar el lunes a los demás días
          </button>
        </div>
        <table className="tabla">
          <tbody>
            {ORDEN.map((i) => {
              const d = dias[i]!;
              return (
                <tr key={i}>
                  <td className="w-32">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--color-petroleo)]" checked={d.laborable} onChange={(e) => cambiarDia(i, { laborable: e.target.checked })} />
                      {NOMBRES_DIAS[i]}
                    </label>
                  </td>
                  {d.laborable ? (
                    tipo === "FIJO" ? (
                      <>
                        <td>
                          <div className="flex items-center gap-2">
                            <input type="time" aria-label={`Entrada ${NOMBRES_DIAS[i]}`} className="campo w-32" value={d.inicio} onChange={(e) => cambiarDia(i, { inicio: e.target.value })} />
                            <span className="text-tinta-tenue">a</span>
                            <input type="time" aria-label={`Salida ${NOMBRES_DIAS[i]}`} className="campo w-32" value={d.fin} onChange={(e) => cambiarDia(i, { fin: e.target.value })} />
                          </div>
                        </td>
                        <td className="num whitespace-nowrap">{duracion(horario.dias[i]!.minutos)}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="flex items-center gap-2">
                            <input inputMode="decimal" aria-label={`Horas ordinarias ${NOMBRES_DIAS[i]}`} className="campo w-24" value={d.horas} onChange={(e) => cambiarDia(i, { horas: e.target.value })} />
                            <span className="text-tinta-suave">horas ordinarias</span>
                          </div>
                        </td>
                        <td className="num whitespace-nowrap">{duracion(horario.dias[i]!.minutos)}</td>
                      </>
                    )
                  ) : (
                    <td colSpan={2} className="text-tinta-tenue">
                      Descanso: todo lo trabajado es hora extra
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 font-semibold">
                Total semanal
              </td>
              <td className={`num pt-2 font-bold ${v.minutosSemana > v.jornadaLegalHoras * 60 ? "text-alerta" : ""}`}>
                {horasDecimales(v.minutosSemana)} de {v.jornadaLegalHoras} h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 font-bold">Descanso no remunerado</legend>
          <div className="space-y-2 text-[0.93rem]">
            <label className="flex items-center gap-2">
              <input type="radio" name="desc" checked={descTipo === "VENTANA"} onChange={() => setDescTipo("VENTANA")} />
              Franja fija
              <input type="time" aria-label="Inicio del descanso" className="campo h-8 w-32" value={vInicio} onChange={(e) => setVInicio(e.target.value)} disabled={descTipo !== "VENTANA"} />
              <span className="text-tinta-tenue">a</span>
              <input type="time" aria-label="Fin del descanso" className="campo h-8 w-32" value={vFin} onChange={(e) => setVFin(e.target.value)} disabled={descTipo !== "VENTANA"} />
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="desc" checked={descTipo === "DURACION"} onChange={() => setDescTipo("DURACION")} />
              Pausa de
              <input inputMode="numeric" aria-label="Minutos de pausa" className="campo h-8 w-16" value={dMin} onChange={(e) => setDMin(e.target.value)} disabled={descTipo !== "DURACION"} />
              min tras
              <input inputMode="decimal" aria-label="Horas antes de la pausa" className="campo h-8 w-16" value={dDespues} onChange={(e) => setDDespues(e.target.value)} disabled={descTipo !== "DURACION"} />
              h de trabajo
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="desc" checked={descTipo === "NINGUNO"} onChange={() => setDescTipo("NINGUNO")} />
              No descontar (el personal marca su salida al almuerzo)
            </label>
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-1.5 font-bold">Horas extra</legend>
          <label className="flex items-start gap-2 text-[0.93rem]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-petroleo)]" checked={aprobacion} onChange={(e) => setAprobacion(e.target.checked)} />
            <span>
              Requieren aprobación de un supervisor
              <span className="block text-tinta-tenue">Si no, se liquidan automáticamente al marcar la salida.</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-[0.93rem]">
            Tolerancia
            <input inputMode="numeric" aria-label="Minutos de tolerancia" className="campo h-8 w-16" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
            minutos
          </label>
          <p className="text-[0.84rem] text-tinta-tenue">Salir unos minutos tarde no genera extras si no se supera la tolerancia.</p>
        </fieldset>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-petroleo)]" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Disponible para asignar a empleados
      </label>

      {(v.errores.length > 0 || v.avisos.length > 0) && (
        <ul className="space-y-1 text-[0.92rem]">
          {v.errores.map((e) => (
            <li key={e} className="text-alerta">{e}</li>
          ))}
          {v.avisos.map((a) => (
            <li key={a} className="text-extra-oscuro">{a}</li>
          ))}
        </ul>
      )}
      <MensajeError error={mut.error} />
      <button className="btn btn-primario w-full" disabled={mut.isPending || v.errores.length > 0}>
        {mut.isPending ? "Guardando…" : h ? "Guardar horario" : "Crear horario"}
      </button>
    </form>
  );
}
