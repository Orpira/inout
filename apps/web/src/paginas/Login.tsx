import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Marca } from "../componentes/Marco";
import { SelectorZona } from "../componentes/SelectorZona";
import { MensajeError, useAviso } from "../componentes/ui";
import { api, ErrorApi } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { aplicarZona, nombreZona, textoDesfase, useZona, zonaDelDispositivo } from "../lib/zona";

const MOTIVO_UBICACION = "Ubicación definida al iniciar sesión";

/** Hora actual en una zona, para comprobar la ubicación antes de entrar. */
function useHoraEn(zona: string) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: zona, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
  } catch {
    return "";
  }
}

export default function Login() {
  const { usuario, entrar } = useSesion();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const aviso = useAviso();
  // Ubicación de la instalación: la que ya rige (llega con cada respuesta del servidor) hasta que se elija otra.
  const zonaActual = useZona();
  const [zona, setZona] = useState(zonaActual);
  const cambia = zona !== zonaActual;
  const detectada = zonaDelDispositivo();
  const horaEnZona = useHoraEn(zona);

  if (usuario) return <Navigate to="/" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      // La ubicación se guarda con la sesión ya abierta y antes de mostrar el panel, para que cargue con la hora correcta.
      await entrar(email, password, async (u) => {
        if (!cambia) return;
        if (u.rol !== "ADMIN") {
          aviso(`La ubicación sigue en ${nombreZona(zonaActual)}: solo un administrador puede cambiarla.`, "error");
          return;
        }
        try {
          const r = await api<{ zona: string }>("/config/zona", { method: "PUT", body: { zona, motivo: MOTIVO_UBICACION } });
          aplicarZona(r.zona);
          aviso(`Ubicación cambiada a ${nombreZona(r.zona)} (${textoDesfase(r.zona)})`);
        } catch (err) {
          aviso(`No se pudo cambiar la ubicación: ${err instanceof ErrorApi ? err.message : "error inesperado"}. Puedes hacerlo en Zona horaria.`, "error");
        }
      });
      nav((loc.state as { desde?: string } | null)?.desde ?? "/", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_480px]">
      <section className="relative hidden overflow-hidden bg-petroleo-oscuro p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Marca claro />
        <div className="max-w-[34rem]">
          <p className="cifra text-[4.5rem] font-bold leading-none">42 h</p>
          <p className="mt-4 text-lg text-white/80">
            Jornada máxima semanal desde el 15 de julio de 2026. INOUT liquida recargos nocturnos desde las 19:00 y
            dominicales al 90&nbsp;% con las reglas de cada fecha.
          </p>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
          <span className="bg-dia" style={{ width: `${(13 / 24) * 100}%` }} />
          <span className="flex-1 bg-noche" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <Marca />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Iniciar sesión</h1>
            <p className="mt-1 text-tinta-suave">Acceso para supervisores y administración.</p>
          </div>
          <MensajeError error={error} />
          <div>
            <label className="etiqueta" htmlFor="email">
              Correo
            </label>
            <input id="email" type="email" autoComplete="username" required className="campo h-10" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="campo h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="ubicacion">
              Ubicación
            </label>
            <SelectorZona id="ubicacion" className="campo h-10" valor={zona} onCambiar={setZona} />
            <p className="mt-1.5 text-[0.88rem] text-tinta-suave">
              {textoDesfase(zona)} · ahora: <span className="font-medium text-tinta">{horaEnZona}</span>
            </p>
            {detectada && detectada !== zona && (
              <p className="mt-1 text-[0.88rem] text-tinta-suave">
                Este dispositivo está en {nombreZona(detectada)}.{" "}
                <button type="button" className="font-semibold text-petroleo underline-offset-2 hover:underline" onClick={() => setZona(detectada)}>
                  Usar esta ubicación
                </button>
              </p>
            )}
            {cambia && (
              <p className="mt-2 rounded-md border border-extra bg-extra-claro p-2.5 text-[0.88rem]" role="status">
                Al entrar como administrador, toda la instalación pasará de {nombreZona(zonaActual)} a {nombreZona(zona)}: kiosko, panel y
                liquidación. Las normas laborales siguen siendo las de Colombia.
              </p>
            )}
          </div>
          <button className="btn btn-primario h-10 w-full" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <p className="text-center text-[0.9rem] text-tinta-suave">
            ¿Vas a registrar tu entrada o salida?{" "}
            <a href="/kiosko" className="font-semibold text-petroleo underline-offset-2 hover:underline">
              Ir al kiosko
            </a>
          </p>
        </form>
      </section>
    </div>
  );
}
