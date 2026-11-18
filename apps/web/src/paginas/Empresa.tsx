import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, MapPin, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { HistorialCambios } from "../componentes/Historial";
import { Cargando, Dialogo, Encabezado, MensajeError, useAviso, Vacio } from "../componentes/ui";
import { api } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { useEmpresa } from "../lib/sucursales";
import type { Sucursal } from "../lib/tipos";

/** Razón social de la empresa y sus sucursales (centros de costo). */
export default function Empresa() {
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === "ADMIN";
  const q = useEmpresa();
  const [editando, setEditando] = useState<Sucursal | "nueva" | null>(null);

  return (
    <div>
      <Encabezado
        titulo="Empresa y sucursales"
        descripcion="La razón social encabeza los reportes. Cada sucursal es un centro de costo: las horas se imputan a la sucursal donde se trabajan, dentro de una única liquidación."
        acciones={
          esAdmin && (
            <button className="btn btn-primario" onClick={() => setEditando("nueva")}>
              <Plus size={16} /> Añadir sucursal
            </button>
          )
        }
      />
      {q.isPending ? (
        <Cargando />
      ) : q.error ? (
        <MensajeError error={q.error} />
      ) : (
        <>
          <FormEmpresa key={`${q.data.empresa.nombre}|${q.data.empresa.nit}`} datos={q.data.empresa} esAdmin={esAdmin} />

          <h2 className="mb-3 mt-8 text-lg font-bold">Sucursales (centros de costo)</h2>
          <div className="panel overflow-x-auto">
            {q.data.sucursales.length === 0 ? (
              <Vacio titulo="Todavía no hay sucursales">
                {esAdmin ? "Añade la primera. Mientras no haya sucursales, todas las horas se liquidan sin centro de costo." : "Un administrador puede crearlas."}
              </Vacio>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Ciudad</th>
                    <th>Ubicación de la sede</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.sucursales.map((s) => (
                    <tr key={s.id} className={esAdmin ? "cursor-pointer" : ""} onClick={() => esAdmin && setEditando(s)}>
                      <td className="font-semibold tabular-nums">{s.codigo}</td>
                      <td className="font-semibold">{esAdmin ? <button className="text-left hover:text-petroleo">{s.nombre}</button> : s.nombre}</td>
                      <td className="text-tinta-suave">{s.ciudad ?? "—"}</td>
                      <td>
                        {s.latitud != null && s.longitud != null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={15} className="text-petroleo" />
                            Definida · radio {s.radioMetros} m
                          </span>
                        ) : (
                          <span className="text-tinta-tenue">Sin ubicación (no se verifica dónde marcan)</span>
                        )}
                      </td>
                      <td>{s.activa ? <span className="text-tinta-suave">Activa</span> : <span className="text-tinta-tenue">Inactiva</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-3 max-w-[75ch] text-[0.88rem] text-tinta-suave">
            Para asociar una tablet a su sucursal, ábrela una vez con <code className="rounded bg-papel px-1">/kiosko?token=…</code>: la tablet propone la sede más cercana por GPS y
            quien la configura la confirma. Si un empleado marca en una sucursal que no es la suya, el kiosko le avisa y le pide el turno que va a realizar.
          </p>
        </>
      )}

      <Dialogo abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Añadir sucursal" : "Editar sucursal"}>
        {editando !== null && <FormSucursal sucursal={editando === "nueva" ? null : editando} onListo={() => setEditando(null)} />}
      </Dialogo>
    </div>
  );
}

function FormEmpresa({ datos, esAdmin }: { datos: { nombre: string; nit: string | null; definida: boolean }; esAdmin: boolean }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [nombre, setNombre] = useState(datos.nombre);
  const [nit, setNit] = useState(datos.nit ?? "");
  const [motivo, setMotivo] = useState("");
  const cambio = nombre.trim() !== datos.nombre || nit.trim() !== (datos.nit ?? "");
  const pideMotivo = datos.definida && cambio;
  const mut = useMutation({
    mutationFn: () => api("/empresa", { method: "PUT", body: { nombre, nit, ...(pideMotivo ? { motivo } : {}) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["empresa"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      aviso("Datos de la empresa guardados");
      setMotivo("");
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    mut.mutate();
  };
  return (
    <form onSubmit={enviar} className="panel space-y-4 p-5">
      <h2 className="text-lg font-bold">Datos de la empresa</h2>
      {!datos.definida && datos.nombre && (
        <p className="rounded-md bg-extra-claro px-3 py-2 text-[0.92rem] text-extra-oscuro">
          Ahora se usa el nombre de la configuración del servidor. Guárdalo aquí para poder cambiarlo desde el panel.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="etiqueta" htmlFor="emp-nombre">Razón social</label>
          <input id="emp-nombre" className="campo" required minLength={2} disabled={!esAdmin} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: SISTEMAS LOGÍSTICOS INDUSTRIALES SAS" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="emp-nit">NIT</label>
          <input id="emp-nit" className="campo" disabled={!esAdmin} value={nit} onChange={(e) => setNit(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {pideMotivo && (
        <div>
          <label className="etiqueta" htmlFor="emp-motivo">Motivo del cambio</label>
          <input id="emp-motivo" className="campo" required minLength={5} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      )}
      <MensajeError error={mut.error} />
      {esAdmin && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.86rem] text-tinta-tenue">Aparece en el encabezado del reporte de horas extra en Excel.</p>
          <button className="btn btn-primario" disabled={mut.isPending || (datos.definida && !cambio)}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
      {datos.definida && <HistorialCambios entidad="empresa" entidadId={1} />}
    </form>
  );
}

function FormSucursal({ sucursal, onListo }: { sucursal: Sucursal | null; onListo: () => void }) {
  const qc = useQueryClient();
  const aviso = useAviso();
  const [f, setF] = useState({
    codigo: sucursal?.codigo ?? "",
    nombre: sucursal?.nombre ?? "",
    ciudad: sucursal?.ciudad ?? "",
    direccion: sucursal?.direccion ?? "",
    latitud: sucursal?.latitud != null ? String(sucursal.latitud) : "",
    longitud: sucursal?.longitud != null ? String(sucursal.longitud) : "",
    radioMetros: String(sucursal?.radioMetros ?? 300),
    activa: sucursal?.activa ?? true,
    motivo: "",
  });
  const [gps, setGps] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const coordenada = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const usarUbicacion = () => {
    if (!navigator.geolocation) return setGps("Este navegador no da la ubicación.");
    setGps("Buscando la ubicación…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setF((x) => ({ ...x, latitud: p.coords.latitude.toFixed(6), longitud: p.coords.longitude.toFixed(6) }));
        setGps(`Ubicación tomada (precisión ±${Math.round(p.coords.accuracy)} m). Hazlo desde la propia sede.`);
      },
      () => setGps("No se pudo obtener la ubicación. Revisa el permiso del navegador o escríbela."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const mut = useMutation({
    mutationFn: () => {
      const { motivo, ...resto } = f;
      const body = {
        ...resto,
        latitud: coordenada(f.latitud),
        longitud: coordenada(f.longitud),
        radioMetros: Math.round(Number(f.radioMetros)),
        ...(sucursal ? { motivo } : {}),
      };
      return sucursal ? api(`/empresa/sucursales/${sucursal.id}`, { method: "PUT", body }) : api("/empresa/sucursales", { body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["empresa"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      aviso(sucursal ? "Sucursal actualizada" : "Sucursal añadida");
      onListo();
    },
  });
  const lat = coordenada(f.latitud);
  const lon = coordenada(f.longitud);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="etiqueta" htmlFor="s-codigo">Código del centro de costo</label>
          <input id="s-codigo" className="campo" required maxLength={30} value={f.codigo} onChange={set("codigo")} placeholder="Ej.: BOD-01" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="s-nombre">Nombre</label>
          <input id="s-nombre" className="campo" required minLength={2} value={f.nombre} onChange={set("nombre")} placeholder="Ej.: Bodega Norte" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="s-ciudad">Ciudad</label>
          <input id="s-ciudad" className="campo" value={f.ciudad} onChange={set("ciudad")} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="s-dir">Dirección</label>
          <input id="s-dir" className="campo" value={f.direccion} onChange={set("direccion")} />
        </div>
      </div>

      <fieldset className="rounded-[10px] border border-linea p-4">
        <legend className="px-1 font-semibold">Ubicación de la sede</legend>
        <p className="mb-3 text-[0.88rem] text-tinta-suave">
          Opcional. Sirve para proponer la sucursal al configurar un kiosko y para avisar si una tablet marca lejos de su sede. Nunca bloquea una marcación.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="etiqueta" htmlFor="s-lat">Latitud</label>
            <input id="s-lat" className="campo tabular-nums" inputMode="decimal" value={f.latitud} onChange={set("latitud")} placeholder="4.7609" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="s-lon">Longitud</label>
            <input id="s-lon" className="campo tabular-nums" inputMode="decimal" value={f.longitud} onChange={set("longitud")} placeholder="-74.0466" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="s-radio">Radio permitido (m)</label>
            <input id="s-radio" className="campo tabular-nums" type="number" min={50} max={5000} required value={f.radioMetros} onChange={set("radioMetros")} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secundario" onClick={usarUbicacion}>
            <LocateFixed size={16} /> Usar la ubicación de este dispositivo
          </button>
          {lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon) && (
            <a className="text-[0.9rem] font-semibold text-petroleo underline underline-offset-2" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noreferrer">
              Ver en el mapa
            </a>
          )}
        </div>
        {gps && <p className="mt-2 text-[0.88rem] text-tinta-suave">{gps}</p>}
      </fieldset>

      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-petroleo)]" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} />
        Activa (los kioskos pueden asociarse a ella)
      </label>
      {sucursal && (
        <div>
          <label className="etiqueta" htmlFor="s-motivo">Motivo del cambio</label>
          <input id="s-motivo" required minLength={5} className="campo" value={f.motivo} onChange={set("motivo")} />
        </div>
      )}
      <MensajeError error={mut.error} />
      <button className="btn btn-primario w-full" disabled={mut.isPending}>
        {mut.isPending ? "Guardando…" : sucursal ? "Guardar cambios" : "Añadir sucursal"}
      </button>
      {sucursal && <HistorialCambios entidad="sucursal" entidadId={sucursal.id} />}
    </form>
  );
}
