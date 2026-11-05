import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Marco } from "./componentes/Marco";
import { Cargando, ProveedorAvisos } from "./componentes/ui";
import { ErrorApi } from "./lib/api";
import { ProveedorSesion } from "./lib/sesion";
import "./estilos.css";

const Kiosko = lazy(() => import("./paginas/Kiosko"));
const Login = lazy(() => import("./paginas/Login"));
const Inicio = lazy(() => import("./paginas/Inicio"));
const Marcaciones = lazy(() => import("./paginas/Marcaciones"));
const Empleados = lazy(() => import("./paginas/Empleados"));
const Liquidacion = lazy(() => import("./paginas/Liquidacion"));
const Configuracion = lazy(() => import("./paginas/Configuracion"));
const Usuarios = lazy(() => import("./paginas/Usuarios"));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ErrorApi && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ProveedorAvisos>
        <BrowserRouter>
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
                        <Route path="liquidacion" element={<Liquidacion />} />
                        <Route path="configuracion" element={<Configuracion />} />
                        <Route path="usuarios" element={<Usuarios />} />
                        <Route path="*" element={<p className="text-tinta-suave">Esta página no existe.</p>} />
                      </Route>
                    </Routes>
                  </ProveedorSesion>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ProveedorAvisos>
    </QueryClientProvider>
  </StrictMode>,
);
