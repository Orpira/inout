import { aHoraLocal, crearCalendario, desdeLocal, inicioNocturno } from "@inout/core";
import { Camera, Check, CloudUpload, Delete, LocateFixed, LogIn, MapPin, ScanLine, TriangleAlert, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Marca } from "../componentes/Marco";
import { api, ErrorApi } from "../lib/api";
import { duracion, fechaLarga, hora } from "../lib/formato";
import {
  actualizarDirectorio,
  buscarEnDirectorio,
  cola,
  directorioDisponible,
  encolar,
  fijarSucursalKiosko,
  maxHorasTurno,
  opcionesTurnoLocal,
  registrarEstadoLocal,
  sincronizar,
  sucursalKiosko,
  tocaEntradaLocal,
  type ContextoMarca,
  type OpcionTurno,
  type SucursalKiosko,
} from "../lib/kioskoOffline";

interface RespuestaMarca {
  tipo: "ENTRADA" | "SALIDA";
  empleado: { nombre: string; apellido: string; identificacion: string };
  aviso: string | null;
  marcacion: {
    entrada: string;
    salida: string | null;
    minutosTotales: number | null;
    minutosExtra: number | null;
    minutosExtraCalculados: number | null;
    estadoExtras: string | null;
  };
}
/** El empleado marca la entrada en una sucursal que no es la suya: debe elegir el turno. */
interface RespuestaElegirTurno {
  tipo: "ELEGIR_TURNO";
  empleado: { nombre: string; apellido: string; identificacion: string };
  sucursal: { id: number; nombre: string };
  sucursalBase: string | null;
  opciones: OpcionTurno[];
}
type Paso =
  | { t: "codigo" }
  | { t: "registrando"; codigo: string }
  | { t: "elegirTurno"; codigo: string; nombre: string; sucursal: string; sucursalBase: string | null; opciones: OpcionTurno[] }
  | { t: "hecho"; r: RespuestaMarca }
  | { t: "guardada"; nombre: string; tipo: "ENTRADA" | "SALIDA" | null; momento: string; aviso: string | null };

const calendario = crearCalendario();
const PLAZO_MS = 6000;
/** Una ubicación más antigua que esto no se envía con la marcación. */
const VIGENCIA_UBICACION_MS = 10 * 60_000;

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

const sinRed = (e: unknown) => e instanceof ErrorApi && (e.status === 0 || e.status >= 500);

/**
 * Kiosko de marcación. El empleado escribe o escanea su código y la marcación se registra de inmediato:
 * el sistema sabe si es entrada o salida. Solo se le pregunta algo si entra en una sucursal que no es la suya
 * (qué turno va a realizar).
 */
export default function Kiosko() {
  const ahora = useAhora();
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<Paso>({ t: "codigo" });
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [pendientes, setPendientes] = useState(() => cola().length);
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  const [envio, setEnvio] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState(() => sucursalKiosko());
  const [configurando, setConfigurando] = useState(false);
  const ubicacion = useRef<{ latitud: number; longitud: number; precisionMetros: number; en: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Token del dispositivo: /kiosko?token=XXXX lo guarda, limpia la URL y abre la elección de sucursal.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const tk = p.get("token");
    if (tk) {
      try {
        localStorage.setItem("inout.kioskoToken", tk);
      } catch {
        /* sin almacenamiento */
      }
      history.replaceState(null, "", "/kiosko");
      setConfigurando(true);
    }
    // Pide al navegador que no borre los datos de la tablet por falta de espacio.
    void navigator.storage?.persist?.();
  }, []);

  // Ubicación del kiosko (si la tablet la da): solo se usa para verificar que marca cerca de su sede.
  useEffect(() => {
    if (!sucursal || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => (ubicacion.current = { latitud: p.coords.latitude, longitud: p.coords.longitude, precisionMetros: Math.round(p.coords.accuracy), en: Date.now() }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sucursal]);

  const contexto = (turno?: { horarioId: number | null }): ContextoMarca => {
    const u = ubicacion.current;
    return {
      sucursalId: sucursal?.id ?? null,
      turno: turno ?? null,
      ubicacion: u && Date.now() - u.en < VIGENCIA_UBICACION_MS ? { latitud: u.latitud, longitud: u.longitud, precisionMetros: u.precisionMetros } : null,
    };
  };

  const reiniciar = useCallback(() => {
    setCodigo("");
    setError(null);
    setPaso({ t: "codigo" });
    setTimeout(() => entrada.current?.focus(), 0);
  }, []);

  // Vuelve al inicio automáticamente tras registrar o si la elección de turno se deja a medias.
  useEffect(() => {
    if (paso.t === "hecho" || paso.t === "guardada") {
      const t = setTimeout(reiniciar, (paso.t === "hecho" ? paso.r.aviso : paso.aviso) ? 9000 : 6000);
      return () => clearTimeout(t);
    }
    if (paso.t === "elegirTurno") {
      const t = setTimeout(reiniciar, 30000);
      return () => clearTimeout(t);
    }
  }, [paso, reiniciar]);

  // Envío de la cola y actualización del directorio.
  const sincronizarAhora = useCallback(async () => {
    if (!cola().length) return;
    const r = await sincronizar();
    const quedan = cola().length;
    setPendientes(quedan);
    if (r.enviadas + r.rechazadas > 0) {
      setEnLinea(true);
      setEnvio(
        `${r.enviadas + r.rechazadas} ${r.enviadas + r.rechazadas === 1 ? "marcación enviada" : "marcaciones enviadas"} al servidor` +
          (r.rechazadas ? `; ${r.rechazadas} quedaron para revisión del supervisor.` : "."),
      );
      setTimeout(() => setEnvio(null), 8000);
    }
  }, []);
  useEffect(() => {
    void actualizarDirectorio().then(() => sincronizarAhora());
    const tCola = setInterval(sincronizarAhora, 20_000);
    const tDir = setInterval(() => void actualizarDirectorio(), 15 * 60_000);
    const online = () => {
      setEnLinea(true);
      void sincronizarAhora();
      void actualizarDirectorio();
    };
    const offline = () => setEnLinea(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(tCola);
      clearInterval(tDir);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [sincronizarAhora]);

  const noEncontrado = (c: string) => {
    setError(`No encontramos el código ${c}. Revisa el número o habla con tu supervisor.`);
    setPaso({ t: "codigo" });
  };

  /** Sin servidor: guarda la marcación en la tablet; la entrada o salida se deduce de lo guardado. */
  const guardarEnTablet = (c: string, turno?: { horarioId: number | null }) => {
    setEnLinea(navigator.onLine && cola().length > 0);
    const e = buscarEnDirectorio(c);
    if (!e && directorioDisponible()) return noEncontrado(c);
    const momento = new Date();
    if (e && sucursal && !turno && tocaEntradaLocal(e, momento)) {
      const eleccion = opcionesTurnoLocal(e, sucursal.id);
      if (eleccion) {
        setPaso({ t: "elegirTurno", codigo: c, nombre: `${e.nombre} ${e.apellido}`, sucursal: sucursal.nombre, ...eleccion });
        return;
      }
    }
    const vencida = !!e?.abiertaDesde && momento.getTime() - new Date(e.abiertaDesde).getTime() > maxHorasTurno() * 3_600_000;
    const aviso = vencida
      ? `Tu turno anterior quedó sin salida: ${e?.salidaProgramada ? `se cerrará con la salida de tu horario (${hora(e.salidaProgramada)})` : "lo revisará tu supervisor"}.`
      : null;
    const { tipo } = encolar(c, momento, contexto(turno));
    setPendientes(cola().length);
    setPaso({ t: "guardada", nombre: e ? `${e.nombre} ${e.apellido}` : `Código ${c}`, tipo, momento: momento.toISOString(), aviso });
    void sincronizarAhora();
  };

  /** Registra la marcación directamente: el servidor decide si es entrada o salida. */
  const registrar = async (c: string, turno?: { horarioId: number | null }) => {
    const limpio = c.trim();
    if (!limpio) return;
    setError(null);
    // Sin red, o con marcas pendientes (para respetar el orden cronológico), va a la cola de la tablet.
    if (!navigator.onLine || cola().length > 0) return guardarEnTablet(limpio, turno);
    setPaso({ t: "registrando", codigo: limpio });
    try {
      const r = await api<RespuestaMarca | RespuestaElegirTurno>("/kiosko/marcar", { body: { codigo: limpio, ...contexto(turno) }, timeoutMs: PLAZO_MS });
      setEnLinea(true);
      if (r.tipo === "ELEGIR_TURNO") {
        setPaso({ t: "elegirTurno", codigo: limpio, nombre: `${r.empleado.nombre} ${r.empleado.apellido}`, sucursal: r.sucursal.nombre, sucursalBase: r.sucursalBase, opciones: r.opciones });
        return;
      }
      registrarEstadoLocal(limpio, r.tipo, r.tipo === "ENTRADA" ? r.marcacion.entrada : r.marcacion.salida!);
      setPaso({ t: "hecho", r });
    } catch (e) {
      if (sinRed(e)) return guardarEnTablet(limpio, turno);
      if (e instanceof ErrorApi && e.status === 404) return noEncontrado(limpio);
      setError((e as Error).message);
      setPaso({ t: "codigo" });
    }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void registrar(codigo);
  };
  const tecla = (k: string) => {
    if (k === "borrar") setCodigo((c) => c.slice(0, -1));
    else setCodigo((c) => (c + k).slice(0, 20));
    entrada.current?.focus();
  };

  // Estado del día para el panel informativo
  const l = aHoraLocal(ahora);
  const festivo = calendario.nombre(l.fecha);
  const domingo = l.diaSemana === 0;
  const iniNoche = inicioNocturno(l.fecha);
  const nocturno = l.minutoDelDia >= iniNoche || l.minutoDelDia < 360;
  const hh = String(l.hora).padStart(2, "0");
  const mm = String(l.minuto).padStart(2, "0");
  const extrasTexto = (r: RespuestaMarca) => {
    const calc = r.marcacion.minutosExtraCalculados ?? 0;
    if (!calc || r.marcacion.estadoExtras === "TOLERANCIA") return null;
    return r.marcacion.estadoExtras === "PENDIENTE" ? `${duracion(calc)} extra, pendientes de aprobación` : `${duracion(calc)} extra`;
  };
  const ocupado = paso.t === "registrando";

  return (
    <div className="min-h-dvh bg-petroleo-oscuro text-white">
      <div className="mx-auto grid min-h-dvh max-w-[1280px] gap-8 px-6 py-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-12 lg:py-10">
        {/* Reloj y contexto del día */}
        <section className="flex flex-col justify-between gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Marca claro />
              {sucursal && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-sm font-medium text-white/85">
                  <MapPin size={15} /> {sucursal.nombre}
                </span>
              )}
            </div>
            {(!enLinea || pendientes > 0) && (
              <span className="inline-flex items-center gap-2 rounded-md bg-extra px-3 py-1.5 text-sm font-semibold text-tinta">
                {enLinea ? <CloudUpload size={16} /> : <WifiOff size={16} />}
                {!enLinea ? "Sin conexión" : "Enviando"}
                {pendientes > 0 && `: ${pendientes} ${pendientes === 1 ? "marcación guardada" : "marcaciones guardadas"} en la tablet`}
              </span>
            )}
          </div>

          <div>
            <p className="text-xl text-white/75">{fechaLarga(ahora)}</p>
            <p className="cifra mt-1 font-bold leading-[0.9]" style={{ fontSize: "clamp(5.5rem, 15vw, 11rem)" }} aria-live="off">
              {hh}
              <span className="animate-pulse text-white/40">:</span>
              {mm}
            </p>
            <p className="mt-4 max-w-[36rem] text-lg text-white/80">
              {festivo
                ? `Hoy es festivo (${festivo}): las horas trabajadas tienen recargo dominical y festivo.`
                : domingo
                  ? "Hoy es domingo: las horas trabajadas tienen recargo dominical."
                  : nocturno
                    ? `Franja nocturna hasta las 06:00. El recargo nocturno aplica desde las ${String(iniNoche / 60).padStart(2, "0")}:00.`
                    : `Franja diurna. La jornada nocturna empieza a las ${String(iniNoche / 60).padStart(2, "0")}:00.`}
            </p>
            {envio && <p className="mt-3 text-white/90" role="status">{envio}</p>}
          </div>

          <DiaEnCurso ahora={ahora} />
        </section>

        {/* Interacción */}
        <section className="flex flex-col justify-center">
          <div className="rounded-[14px] bg-white p-6 text-tinta shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:p-8">
            {(paso.t === "codigo" || paso.t === "registrando") && (
              <form onSubmit={enviar}>
                <label htmlFor="codigo" className="block text-xl font-bold">
                  Escribe o escanea tu código
                </label>
                <p className="mt-1 text-tinta-suave">Es el número de identificación de tu carné. La entrada o la salida se registra al instante.</p>
                <input
                  id="codigo"
                  ref={entrada}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  className="cifra mt-5 h-20 w-full rounded-lg border-2 border-linea-fuerte bg-papel px-5 text-center text-[2.6rem] font-bold tracking-[0.12em] focus:border-petroleo focus:outline-none"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\s/g, ""))}
                  disabled={ocupado}
                />
                {error && (
                  <p role="alert" className="mt-3 rounded-md bg-alerta-claro px-3 py-2 font-medium text-alerta">
                    {error}
                  </p>
                )}
                <div className="mt-5 grid grid-cols-3 gap-2.5">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                    <TeclaNum key={n} onClick={() => tecla(n)}>
                      {n}
                    </TeclaNum>
                  ))}
                  <TeclaNum onClick={() => tecla("borrar")} etiqueta="Borrar">
                    <Delete size={26} />
                  </TeclaNum>
                  <TeclaNum onClick={() => tecla("0")}>0</TeclaNum>
                  <button type="submit" disabled={!codigo || ocupado} className="h-16 rounded-lg bg-petroleo text-lg font-bold text-white disabled:opacity-40">
                    {ocupado ? "Registrando…" : "Marcar"}
                  </button>
                </div>
                <button type="button" className="btn btn-secundario mt-4 h-12 w-full text-base" onClick={() => setEscaneando(true)} disabled={ocupado}>
                  <Camera size={20} /> Escanear con la cámara
                </button>
              </form>
            )}

            {paso.t === "elegirTurno" && (
              <div>
                <p className="flex items-start gap-2 rounded-md bg-extra-claro px-3 py-2 text-extra-oscuro">
                  <TriangleAlert size={20} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Tu turno asignado no corresponde a esta sucursal.</strong>{" "}
                    {paso.sucursalBase ? `Tu sucursal es ${paso.sucursalBase} y estás marcando en ${paso.sucursal}.` : `Estás marcando en ${paso.sucursal}.`}
                  </span>
                </p>
                <p className="mt-4 text-[1.6rem] font-bold leading-tight">{paso.nombre}</p>
                <p className="mt-1 text-lg text-tinta-suave">¿Qué turno vas a realizar?</p>
                <div className="mt-4 grid gap-2.5">
                  {paso.opciones.map((o) => (
                    <button
                      key={o.horarioId ?? "habitual"}
                      onClick={() => void registrar(paso.codigo, { horarioId: o.horarioId })}
                      className={`flex min-h-16 items-center justify-between rounded-lg border-2 px-5 text-left text-lg font-semibold ${
                        o.habitual ? "border-linea-fuerte bg-papel" : "border-petroleo bg-petroleo-claro text-petroleo-oscuro"
                      }`}
                    >
                      {o.nombre}
                      <LogIn size={24} />
                    </button>
                  ))}
                </div>
                <button className="btn btn-fantasma mt-3 h-12 w-full text-base" onClick={reiniciar}>
                  Cancelar
                </button>
              </div>
            )}

            {paso.t === "hecho" && (
              <div className="text-center">
                <span
                  className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white ${paso.r.tipo === "ENTRADA" ? "bg-petroleo" : "bg-noche"}`}
                >
                  <Check size={44} strokeWidth={3} />
                </span>
                <p className="mt-5 text-2xl font-bold">{paso.r.tipo === "ENTRADA" ? "Entrada registrada" : "Salida registrada"}</p>
                <p className="cifra mt-1 text-[3.5rem] font-bold leading-none">
                  {hora(paso.r.tipo === "ENTRADA" ? paso.r.marcacion.entrada : paso.r.marcacion.salida!)}
                </p>
                <p className="mt-3 text-xl font-semibold">
                  {paso.r.empleado.nombre} {paso.r.empleado.apellido}
                </p>
                {paso.r.tipo === "SALIDA" && (
                  <p className="mt-4 text-lg">
                    Trabajaste <strong>{duracion((paso.r.marcacion.minutosTotales ?? 0) + Math.max(0, (paso.r.marcacion.minutosExtraCalculados ?? 0) - (paso.r.marcacion.minutosExtra ?? 0)))}</strong>
                    {extrasTexto(paso.r) && (
                      <>
                        , de ellas <strong className="text-extra-oscuro">{extrasTexto(paso.r)}</strong>
                      </>
                    )}
                    .
                  </p>
                )}
                {paso.r.aviso && <p className="mt-4 rounded-md bg-extra-claro px-3 py-2 text-left text-extra-oscuro">{paso.r.aviso}</p>}
                <p className="mt-4 text-[0.92rem] text-tinta-tenue">¿No eres tú? Avisa a tu supervisor.</p>
                <button className="btn btn-secundario mt-4 h-12 w-full text-base" onClick={reiniciar}>
                  Listo
                </button>
              </div>
            )}

            {paso.t === "guardada" && (
              <div className="text-center">
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-extra text-tinta">
                  <Check size={44} strokeWidth={3} />
                </span>
                <p className="mt-5 text-2xl font-bold">
                  {paso.tipo === "ENTRADA" ? "Entrada guardada" : paso.tipo === "SALIDA" ? "Salida guardada" : "Marcación guardada"}
                </p>
                <p className="cifra mt-1 text-[3.5rem] font-bold leading-none">{hora(paso.momento)}</p>
                <p className="mt-3 text-xl font-semibold">{paso.nombre}</p>
                {paso.aviso && <p className="mt-4 rounded-md bg-extra-claro px-3 py-2 text-left text-extra-oscuro">{paso.aviso}</p>}
                <p className="mt-4 flex items-start gap-2 text-left text-tinta-suave">
                  <WifiOff size={18} className="mt-0.5 shrink-0" />
                  Sin conexión con el servidor: quedó guardada en esta tablet y se enviará sola, en orden con las demás.
                </p>
                <button className="btn btn-secundario mt-6 h-12 w-full text-base" onClick={reiniciar}>
                  Listo
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {escaneando && (
        <Escaner
          onCerrar={() => setEscaneando(false)}
          onCodigo={(c) => {
            setEscaneando(false);
            setCodigo(c);
            void registrar(c);
          }}
        />
      )}
      {configurando && (
        <ConfigurarSucursal
          actual={sucursal}
          onListo={(s) => {
            fijarSucursalKiosko(s);
            setSucursal(s);
            setConfigurando(false);
          }}
          onCerrar={() => setConfigurando(false)}
        />
      )}
    </div>
  );
}

/** Distancia aproximada en metros entre dos coordenadas. */
function distancia(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.latitud - a.latitud) / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(rad(b.longitud - a.longitud) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

interface SucursalOpcion {
  id: number;
  codigo: string;
  nombre: string;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
}

/**
 * Asociación del kiosko a una sucursal. Se abre al autorizar el dispositivo con /kiosko?token=…
 * La ubicación de la tablet propone la sede más cercana; quien lo configura confirma.
 */
function ConfigurarSucursal({ actual, onListo, onCerrar }: { actual: SucursalKiosko | null; onListo: (s: SucursalKiosko | null) => void; onCerrar: () => void }) {
  const [lista, setLista] = useState<SucursalOpcion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aqui, setAqui] = useState<{ latitud: number; longitud: number } | null>(null);
  const [gps, setGps] = useState<"buscando" | "listo" | "no">("buscando");

  useEffect(() => {
    api<{ datos: SucursalOpcion[] }>("/kiosko/sucursales", { timeoutMs: 10000 })
      .then((r) => setLista(r.datos))
      .catch((e: Error) => setError(e.message));
    if (!navigator.geolocation) return setGps("no");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAqui({ latitud: p.coords.latitude, longitud: p.coords.longitude });
        setGps("listo");
      },
      () => setGps("no"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  const conDistancia = (lista ?? []).map((s) => ({
    ...s,
    metros: aqui && s.latitud != null && s.longitud != null ? Math.round(distancia(aqui, { latitud: s.latitud, longitud: s.longitud })) : null,
  }));
  const cercana = conDistancia.filter((s) => s.metros !== null).sort((a, b) => a.metros! - b.metros!)[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal aria-label="Sucursal de este kiosko">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[14px] bg-white p-6 text-tinta">
        <h2 className="text-xl font-bold">¿En qué sucursal está este kiosko?</h2>
        <p className="mt-1 text-tinta-suave">
          Las marcaciones se imputarán a ese centro de costo. Si un empleado de otra sucursal marca aquí, el kiosko le pedirá el turno que va a realizar.
        </p>
        <p className="mt-3 flex items-center gap-2 text-[0.92rem] text-tinta-suave">
          <LocateFixed size={16} />
          {gps === "buscando" ? "Buscando la ubicación de la tablet…" : gps === "no" ? "No se pudo obtener la ubicación: elige la sucursal de la lista." : cercana ? `La sede más cercana es ${cercana.nombre} (a ${cercana.metros} m).` : "Ninguna sucursal tiene coordenadas para comparar."}
        </p>
        {error && <p className="mt-3 rounded-md bg-alerta-claro px-3 py-2 text-alerta">{error}</p>}
        {lista && lista.length === 0 && <p className="mt-4 text-tinta-suave">Todavía no hay sucursales. Créalas en el panel, en "Empresa y sucursales".</p>}
        <div className="mt-4 grid gap-2">
          {conDistancia.map((s) => (
            <button
              key={s.id}
              onClick={() => onListo({ id: s.id, nombre: s.nombre })}
              className={`flex items-center justify-between rounded-lg border-2 px-4 py-3 text-left ${
                s.id === cercana?.id ? "border-petroleo bg-petroleo-claro" : actual?.id === s.id ? "border-petroleo" : "border-linea"
              }`}
            >
              <span>
                <span className="block font-semibold">{s.nombre}</span>
                <span className="text-[0.88rem] text-tinta-suave">
                  Centro de costo {s.codigo}
                  {s.ciudad ? ` · ${s.ciudad}` : ""}
                  {s.metros !== null ? ` · a ${s.metros < 1000 ? `${s.metros} m` : `${(s.metros / 1000).toFixed(1)} km`}` : ""}
                </span>
              </span>
              {s.id === cercana?.id && <span className="text-[0.82rem] font-semibold text-petroleo">Propuesta</span>}
              {actual?.id === s.id && s.id !== cercana?.id && <span className="text-[0.82rem] font-semibold text-petroleo">Actual</span>}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {actual && (
            <button className="btn btn-fantasma" onClick={() => onListo(null)}>
              Quitar sucursal
            </button>
          )}
          <button className="btn btn-secundario" onClick={onCerrar}>
            {actual ? "Mantener la actual" : "Más tarde"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeclaNum({ children, onClick, etiqueta }: { children: React.ReactNode; onClick: () => void; etiqueta?: string }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={onClick}
      className="cifra flex h-16 items-center justify-center rounded-lg border border-linea bg-papel text-[1.7rem] font-semibold active:bg-petroleo-claro"
    >
      {children}
    </button>
  );
}

/** Cinta del día actual (06:00 → 06:00) con la posición de "ahora". */
function DiaEnCurso({ ahora }: { ahora: Date }) {
  const l = aHoraLocal(ahora);
  const fechaVentana = l.hora >= 6 ? l.fecha : aHoraLocal(new Date(ahora.getTime() - 86_400_000)).fecha;
  const origen = desdeLocal(fechaVentana, "06:00").getTime();
  const pos = Math.min(100, ((ahora.getTime() - origen) / 86_400_000) * 100);
  const noche = ((inicioNocturno(fechaVentana) - 360) / 1440) * 100;
  return (
    <div aria-hidden>
      <div className="relative h-4 rounded-full">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-dia/90" style={{ width: `${noche}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-full bg-noche" style={{ left: `${noche}%` }} />
        <div className="absolute inset-y-0 right-0 bg-petroleo-oscuro/55" style={{ left: `${pos}%` }} />
        <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-white" style={{ left: `${pos}%` }} />
      </div>
      <div className="relative mt-2 h-5 text-sm text-white/60 tabular-nums">
        <span className="absolute left-0">06:00</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${noche}%` }}>
          {String(inicioNocturno(fechaVentana) / 60).padStart(2, "0")}:00
        </span>
        <span className="absolute right-0">06:00</span>
        <span className="absolute top-[-2.6rem] -translate-x-1/2 text-[0.8rem] font-semibold text-white" style={{ left: `${pos}%` }}>
          Ahora
        </span>
      </div>
    </div>
  );
}

function Escaner({ onCerrar, onCodigo }: { onCerrar: () => void; onCodigo: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let detener: (() => void) | undefined;
    let activo = true;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const lector = new BrowserMultiFormatReader();
        const controles = await lector.decodeFromVideoDevice(undefined, video.current!, (res) => {
          if (res && activo) {
            activo = false;
            controles.stop();
            onCodigo(res.getText().trim());
          }
        });
        detener = () => controles.stop();
      } catch {
        setError("No pudimos usar la cámara. Revisa los permisos o escribe tu código.");
      }
    })();
    return () => {
      activo = false;
      detener?.();
    };
  }, [onCodigo]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal aria-label="Escanear código">
      <div className="w-full max-w-xl overflow-hidden rounded-[14px] bg-tinta">
        <div className="relative aspect-video bg-black">
          <video ref={video} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-12 top-1/2 h-0.5 -translate-y-1/2 bg-extra" />
          <ScanLine className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/30" size={120} />
        </div>
        <div className="flex items-center justify-between gap-4 p-4 text-white">
          <p>{error ?? "Acerca el código de barras de tu carné a la cámara."}</p>
          <button className="btn h-11 bg-white/10 text-white hover:bg-white/20" onClick={onCerrar}>
            <X size={18} /> Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
