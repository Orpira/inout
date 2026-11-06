import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { HistorialCambios } from "../componentes/Historial";
import { Cargando, Encabezado, MensajeError, useAviso } from "../componentes/ui";
import { api } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { aplicarZona, nombreZona, textoDesfase, todasLasZonas, ZONAS_SUGERIDAS } from "../lib/zona";

interface RespuestaZona {
  zona: string;
  predeterminada: string;
}

/** Hora actual en una zona, para comparar antes de guardar. */
function useReloj(zona: string) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: zona, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
  } catch {
    return "";
  }
}

export default function ZonaHoraria() {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "ADMIN";
  const qc = useQueryClient();
  const aviso = useAviso();
  const q = useQuery({ queryKey: ["zona-horaria"], queryFn: () => api<RespuestaZona>("/config/zona") });
  const [zona, setZona] = useState("");
  const [motivo, setMotivo] = useState("");
  const zonaGuardada = q.data?.zona;
  useEffect(() => {
    if (zonaGuardada) setZona(zonaGuardada);
  }, [zonaGuardada]);

  const otras = useMemo(() => {
    const sugeridas = new Set(ZONAS_SUGERIDAS.map((z) => z.zona));
    return todasLasZonas().filter((z) => !sugeridas.has(z));
  }, []);

  const guardar = useMutation({
    mutationFn: () => api<RespuestaZona>("/config/zona", { method: "PUT", body: { zona, motivo } }),
    onSuccess: (r) => {
      setMotivo("");
      qc.setQueryData(["zona-horaria"], r);
      aplicarZona(r.zona);
      void qc.invalidateQueries();
      aviso(`Zona horaria cambiada a ${nombreZona(r.zona)}`);
    },
  });

  const relojSeleccion = useReloj(zona || "UTC");

  if (q.isPending) return <Cargando />;
  if (q.error) return <MensajeError error={q.error} />;

  const actual = q.data.zona;
  const cambia = zona !== "" && zona !== actual;

  return (
    <div className="max-w-[760px]">
      <Encabezado
        titulo="Zona horaria"
        descripcion="Hora local de la empresa. Rige el reloj del kiosko, las fechas y horas del panel y la liquidación: el día al que pertenece cada turno, la franja nocturna y los festivos."
      />

      <div className="panel mb-6 p-4">
        <p className="text-[0.9rem] text-tinta-suave">Zona actual</p>
        <p className="text-lg font-bold">
          {nombreZona(actual)} <span className="font-normal text-tinta-suave">· {textoDesfase(actual)}</span>
        </p>
        {actual === q.data.predeterminada && <p className="text-[0.88rem] text-tinta-suave">Es la zona predeterminada.</p>}
      </div>

      {esAdmin ? (
        <form
          className="rounded-[10px] border border-linea bg-superficie p-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <h2 className="font-bold">Cambiar la zona horaria</h2>
          <label className="etiqueta mt-3" htmlFor="zona">
            Zona
          </label>
          <select id="zona" className="campo" value={zona} onChange={(e) => setZona(e.target.value)}>
            <optgroup label="Frecuentes">
              {ZONAS_SUGERIDAS.map((z) => (
                <option key={z.zona} value={z.zona}>
                  {z.nombre} ({textoDesfase(z.zona)})
                </option>
              ))}
            </optgroup>
            {otras.length > 0 && (
              <optgroup label="Todas las zonas">
                {otras.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="mt-2 text-[0.9rem] text-tinta-suave">
            Hora en esa zona ahora: <span className="font-medium text-tinta">{relojSeleccion}</span>
          </p>

          {cambia && (
            <div className="mt-4 rounded-md border border-extra bg-extra-claro p-3 text-[0.9rem]">
              <p className="font-semibold text-extra-oscuro">Antes de cambiarla</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Las normas laborales que se aplican siguen siendo las de Colombia (jornada, recargos y festivos).</li>
                <li>Los turnos nuevos se liquidarán con la hora de {nombreZona(zona)}. Los ya cerrados no cambian hasta que los recalcules en Festivos y normas.</li>
                <li>Los kioskos toman la nueva zona en cuanto vuelven a conectar con el servidor.</li>
              </ul>
            </div>
          )}

          <input
            required
            minLength={5}
            className="campo mt-4"
            placeholder="Motivo del cambio (p. ej. la sede opera en España)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-label="Motivo del cambio"
          />
          <MensajeError error={guardar.error} />
          <button className="btn btn-primario mt-3" disabled={!cambia || guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar zona horaria"}
          </button>
        </form>
      ) : (
        <p className="text-tinta-suave">Solo un administrador puede cambiar la zona horaria.</p>
      )}

      <div className="mt-6">
        <HistorialCambios entidad="ajuste" />
      </div>
    </div>
  );
}
