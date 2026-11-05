import { aHoraLocal, crearCalendario, desdeLocal, inicioNocturno } from "@inout/core";
import { Camera, Check, Delete, LogIn, LogOut, ScanLine, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Marca } from "../componentes/Marco";
import { api, ErrorApi } from "../lib/api";
import { duracion, fechaLarga, hora } from "../lib/formato";

interface EmpleadoKiosko {
  id: number;
  nombre: string;
  apellido: string;
  identificacion: string;
  cargo: string | null;
  proximaMarca: "ENTRADA" | "SALIDA";
  abiertaDesde: string | null;
}
interface RespuestaMarca {
  tipo: "ENTRADA" | "SALIDA";
  empleado: { nombre: string; apellido: string };
  aviso: string | null;
  marcacion: { entrada: string; salida: string | null; minutosTotales: number | null; minutosExtra: number | null };
}
type Paso =
  | { t: "codigo" }
  | { t: "buscando" }
  | { t: "confirmar"; empleado: EmpleadoKiosko }
  | { t: "registrando"; empleado: EmpleadoKiosko }
  | { t: "hecho"; r: RespuestaMarca }
  | { t: "offline"; codigo: string; guardada: boolean };

const COLA = "inout.kioskoCola";
const calendario = crearCalendario();
const leerCola = (): { codigo: string; capturadoEn: string }[] => {
  try {
    return JSON.parse(localStorage.getItem(COLA) ?? "[]");
  } catch {
    return [];
  }
};
const guardarCola = (c: { codigo: string; capturadoEn: string }[]) => {
  try {
    localStorage.setItem(COLA, JSON.stringify(c));
  } catch {
    /* almacenamiento no disponible */
  }
};

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

export default function Kiosko() {
  const ahora = useAhora();
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<Paso>({ t: "codigo" });
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [pendientes, setPendientes] = useState(() => leerCola().length);
  const entrada = useRef<HTMLInputElement>(null);

  // Token del dispositivo: /kiosko?token=XXXX lo guarda y limpia la URL.
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
    }
  }, []);

  const reiniciar = useCallback(() => {
    setCodigo("");
    setError(null);
    setPaso({ t: "codigo" });
    setTimeout(() => entrada.current?.focus(), 0);
  }, []);

  // Vuelve al inicio automáticamente tras confirmar o si se deja a medias.
  useEffect(() => {
    if (paso.t === "hecho" || paso.t === "offline") {
      const t = setTimeout(reiniciar, paso.t === "hecho" && paso.r.aviso ? 9000 : 6000);
      return () => clearTimeout(t);
    }
    if (paso.t === "confirmar") {
      const t = setTimeout(reiniciar, 20000);
      return () => clearTimeout(t);
    }
  }, [paso, reiniciar]);

  // Sincroniza marcaciones guardadas sin conexión.
  const sincronizar = useCallback(async () => {
    const cola = leerCola();
    if (!cola.length) return;
    const restantes: typeof cola = [];
    for (const m of cola) {
      try {
        await api("/kiosko/marcar", { body: m });
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 0) restantes.push(m);
        // Otros errores (duplicado, demasiado antigua) se descartan: el supervisor lo verá como faltante.
      }
    }
    guardarCola(restantes);
    setPendientes(restantes.length);
  }, []);
  useEffect(() => {
    void sincronizar();
    const t = setInterval(sincronizar, 30000);
    window.addEventListener("online", sincronizar);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", sincronizar);
    };
  }, [sincronizar]);

  const buscar = async (c: string) => {
    const limpio = c.trim();
    if (!limpio) return;
    setError(null);
    setPaso({ t: "buscando" });
    try {
      const empleado = await api<EmpleadoKiosko>(`/kiosko/empleado/${encodeURIComponent(limpio)}`);
      setPaso({ t: "confirmar", empleado });
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 0) {
        setPaso({ t: "offline", codigo: limpio, guardada: false });
      } else {
        setError(e instanceof ErrorApi && e.status === 404 ? `No encontramos el código ${limpio}. Revisa el número o habla con tu supervisor.` : (e as Error).message);
        setPaso({ t: "codigo" });
      }
    }
  };

  const registrar = async (empleado: EmpleadoKiosko) => {
    setPaso({ t: "registrando", empleado });
    try {
      const r = await api<RespuestaMarca>("/kiosko/marcar", { body: { codigo: empleado.identificacion } });
      setPaso({ t: "hecho", r });
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 0) {
        guardarOffline(empleado.identificacion);
        return;
      }
      setError((e as Error).message);
      setPaso({ t: "confirmar", empleado });
    }
  };

  const guardarOffline = (c: string) => {
    const cola = [...leerCola(), { codigo: c, capturadoEn: new Date().toISOString() }];
    guardarCola(cola);
    setPendientes(cola.length);
    setPaso({ t: "offline", codigo: c, guardada: true });
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void buscar(codigo);
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

  return (
    <div className="min-h-dvh bg-petroleo-oscuro text-white">
      <div className="mx-auto grid min-h-dvh max-w-[1280px] gap-8 px-6 py-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-12 lg:py-10">
        {/* Reloj y contexto del día */}
        <section className="flex flex-col justify-between gap-8">
          <div className="flex items-center justify-between">
            <Marca claro />
            {pendientes > 0 && (
              <span className="inline-flex items-center gap-2 rounded-md bg-extra px-3 py-1 text-sm font-semibold text-tinta">
                <WifiOff size={15} /> {pendientes} {pendientes === 1 ? "marcación pendiente" : "marcaciones pendientes"} de enviar
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
          </div>

          <DiaEnCurso ahora={ahora} />
        </section>

        {/* Interacción */}
        <section className="flex flex-col justify-center">
          <div className="rounded-[14px] bg-white p-6 text-tinta shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:p-8">
            {(paso.t === "codigo" || paso.t === "buscando") && (
              <form onSubmit={enviar}>
                <label htmlFor="codigo" className="block text-xl font-bold">
                  Escribe o escanea tu código
                </label>
                <p className="mt-1 text-tinta-suave">Es el número de identificación de tu carné.</p>
                <input
                  id="codigo"
                  ref={entrada}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  className="cifra mt-5 h-20 w-full rounded-lg border-2 border-linea-fuerte bg-papel px-5 text-center text-[2.6rem] font-bold tracking-[0.12em] focus:border-petroleo focus:outline-none"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\s/g, ""))}
                  disabled={paso.t === "buscando"}
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
                  <button
                    type="submit"
                    disabled={!codigo || paso.t === "buscando"}
                    className="h-16 rounded-lg bg-petroleo text-lg font-bold text-white disabled:opacity-40"
                  >
                    {paso.t === "buscando" ? "…" : "Continuar"}
                  </button>
                </div>
                <button type="button" className="btn btn-secundario mt-4 h-12 w-full text-base" onClick={() => setEscaneando(true)}>
                  <Camera size={20} /> Escanear con la cámara
                </button>
              </form>
            )}

            {(paso.t === "confirmar" || paso.t === "registrando") && (
              <div>
                <p className="text-tinta-suave">Hola,</p>
                <p className="text-[2rem] font-bold leading-tight">
                  {paso.empleado.nombre} {paso.empleado.apellido}
                </p>
                <p className="mt-1 text-tinta-suave">
                  <span>{paso.empleado.cargo ?? "Sin cargo asignado"}</span>
                  <span className="ml-4 tabular-nums">Código {paso.empleado.identificacion}</span>
                </p>
                {paso.empleado.abiertaDesde && (
                  <p className="mt-4 rounded-md bg-petroleo-claro px-3 py-2 text-petroleo-oscuro">
                    Entraste a las <strong>{hora(paso.empleado.abiertaDesde)}</strong>. Llevas{" "}
                    {duracion(Math.floor((ahora.getTime() - new Date(paso.empleado.abiertaDesde).getTime()) / 60000))}.
                  </p>
                )}
                {error && (
                  <p role="alert" className="mt-3 rounded-md bg-alerta-claro px-3 py-2 font-medium text-alerta">
                    {error}
                  </p>
                )}
                <button
                  autoFocus
                  disabled={paso.t === "registrando"}
                  onClick={() => registrar(paso.empleado)}
                  className={`mt-6 flex h-24 w-full items-center justify-center gap-3 rounded-lg text-[1.6rem] font-bold text-white disabled:opacity-60 ${
                    paso.empleado.proximaMarca === "ENTRADA" ? "bg-petroleo" : "bg-noche"
                  }`}
                >
                  {paso.empleado.proximaMarca === "ENTRADA" ? <LogIn size={30} /> : <LogOut size={30} />}
                  {paso.t === "registrando"
                    ? "Registrando…"
                    : paso.empleado.proximaMarca === "ENTRADA"
                      ? "Registrar entrada"
                      : "Registrar salida"}
                </button>
                <button className="btn btn-fantasma mt-3 h-12 w-full text-base" onClick={reiniciar}>
                  No soy yo
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
                <p className="mt-5 text-2xl font-bold">
                  {paso.r.tipo === "ENTRADA" ? "Entrada registrada" : "Salida registrada"}
                </p>
                <p className="cifra mt-1 text-[3.5rem] font-bold leading-none">
                  {hora(paso.r.tipo === "ENTRADA" ? paso.r.marcacion.entrada : paso.r.marcacion.salida!)}
                </p>
                <p className="mt-3 text-lg text-tinta-suave">
                  {paso.r.empleado.nombre} {paso.r.empleado.apellido}
                </p>
                {paso.r.tipo === "SALIDA" && (
                  <p className="mt-4 text-lg">
                    Trabajaste <strong>{duracion(paso.r.marcacion.minutosTotales)}</strong>
                    {(paso.r.marcacion.minutosExtra ?? 0) > 0 && (
                      <>
                        , de ellas <strong className="text-extra-oscuro">{duracion(paso.r.marcacion.minutosExtra)} extra</strong>
                      </>
                    )}
                    .
                  </p>
                )}
                {paso.r.aviso && <p className="mt-4 rounded-md bg-extra-claro px-3 py-2 text-left text-extra-oscuro">{paso.r.aviso}</p>}
                <button className="btn btn-secundario mt-6 h-12 w-full text-base" onClick={reiniciar}>
                  Listo
                </button>
              </div>
            )}

            {paso.t === "offline" && (
              <div className="text-center">
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-extra text-tinta">
                  <WifiOff size={38} />
                </span>
                {paso.guardada ? (
                  <>
                    <p className="mt-5 text-2xl font-bold">Marcación guardada sin conexión</p>
                    <p className="mt-2 text-tinta-suave">
                      Registramos la hora {hora(new Date())} para el código {paso.codigo}. Se enviará automáticamente cuando vuelva la red.
                    </p>
                    <button className="btn btn-secundario mt-6 h-12 w-full text-base" onClick={reiniciar}>
                      Listo
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-5 text-2xl font-bold">No hay conexión con el servidor</p>
                    <p className="mt-2 text-tinta-suave">Puedes guardar la marcación ahora con la hora actual y se enviará al reconectar.</p>
                    <button className="btn btn-primario mt-6 h-14 w-full text-lg" onClick={() => guardarOffline(paso.codigo)}>
                      Guardar marcación de {paso.codigo}
                    </button>
                    <button className="btn btn-fantasma mt-2 h-12 w-full text-base" onClick={reiniciar}>
                      Cancelar
                    </button>
                  </>
                )}
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
            void buscar(c);
          }}
        />
      )}
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
