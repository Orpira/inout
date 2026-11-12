import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Marco } from "./componentes/Marco";
import { Cargando, ProveedorAvisos } from "./componentes/ui";
import { ErrorApi } from "./lib/api";
import { ProveedorSesion } from "./lib/sesion";
import { iniciarZona, useZona } from "./lib/zona";
import "./estilos.css";
import { registerSW } from "virtual:pwa-register";

// Antes de pintar: la última zona horaria conocida (el kiosko puede abrir sin conexión).
iniciarZona();

// Service worker: guarda la aplicación en el dispositivo para abrirla sin conexión.
registerSW({ immediate: true });

const Kiosko = lazy(() => import("./paginas/Kiosko"));
const Login = lazy(() => import("./paginas/Login"));
const Inicio = lazy(() => import("./paginas/Inicio"));
const Marcaciones = lazy(() => import("./paginas/Marcaciones"));
const Empleados = lazy(() => import("./paginas/Empleados"));
const Horarios = lazy(() => import("./paginas/Horarios"));
const Liquidacion = lazy(() => import("./paginas/Liquidacion"));
const Configuracion = lazy(() => import("./paginas/Configuracion"));
const Usuarios = lazy(() => import("./paginas/Usuarios"));
const ZonaHoraria = lazy(() => import("./paginas/ZonaHoraria"));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ErrorApi && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Si cambia la zona horaria, vuelve a pintar todo y recarga los datos con la nueva zona. */
function ConZona({ children }: { children: ReactNode }) {
  const zona = useZona();
  const anterior = useRef(zona);
  useEffect(() => {
    if (anterior.current !== zona) {
      anterior.current = zona;
      void qc.invalidateQueries();
    }
  }, [zona]);
  return <div key={zona} className="contents">{children}</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      {/* Avisos y navegación quedan fuera de ConZona: un cambio de zona no debe perder el aviso ni la ruta. */}
      <ProveedorAvisos>
        <BrowserRouter>
          <ConZona>
            <Suspense fallback={<Cargando />}>
              <Routes>
                <Route path="/kiosko" element={<Kiosko />} />
                <Route
                  path="*"
                  element={
                    <ProveedorSesion>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route element={<Marco />}>
                          <Route index element={<Inicio />} />
                          <Route path="marcaciones" element={<Marcaciones />} />
                          <Route path="empleados" element={<Empleados />} />
                          <Route path="horarios" element={<Horarios />} />
                          <Route path="liquidacion" element={<Liquidacion />} />
                          <Route path="configuracion" element={<Configuracion />} />
                          <Route path="usuarios" element={<Usuarios />} />
                          <Route path="zona-horaria" element={<ZonaHoraria />} />
                          <Route path="*" element={<p className="text-tinta-suave">Esta página no existe.</p>} />
                        </Route>
                      </Routes>
                    </ProveedorSesion>
                  }
                />
              </Routes>
            </Suspense>
          </ConZona>
        </BrowserRouter>
      </ProveedorAvisos>
    </QueryClientProvider>
  </StrictMode>,
);
