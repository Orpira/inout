import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Marca } from "../componentes/Marco";
import { MensajeError } from "../componentes/ui";
import { useSesion } from "../lib/sesion";

export default function Login() {
  const { usuario, entrar } = useSesion();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await entrar(email, password);
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
