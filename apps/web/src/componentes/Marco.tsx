import { CalendarClock, CalendarCog, ClipboardList, Clock3, Globe2, LayoutGrid, LogOut, Menu, ReceiptText, Tablet, Users, UserCog } from "lucide-react";
import { useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { useSesion } from "../lib/sesion";
import { Cargando } from "./ui";

const NAV = [
  { a: "/", texto: "Inicio", icono: LayoutGrid },
  { a: "/marcaciones", texto: "Marcaciones", icono: ClipboardList },
  { a: "/liquidacion", texto: "Liquidación", icono: ReceiptText },
  { a: "/empleados", texto: "Empleados", icono: Users },
  { a: "/horarios", texto: "Horarios", icono: CalendarClock },
  { a: "/configuracion", texto: "Festivos y normas", icono: CalendarCog },
  { a: "/usuarios", texto: "Usuarios", icono: UserCog, soloAdmin: true },
  { a: "/zona-horaria", texto: "Zona horaria", icono: Globe2, soloAdmin: true },
];

export function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold ${claro ? "text-white" : "text-tinta"}`}>
      <Clock3 size={20} strokeWidth={2.5} className={claro ? "text-extra" : "text-petroleo"} />
      <span className="text-[1.2rem] tracking-tight" style={{ fontStretch: "125%" }}>
        INOUT
      </span>
    </span>
  );
}

export function Marco() {
  const { usuario, cargando, salir } = useSesion();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();

  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;

  const enlaces = NAV.filter((n) => !n.soloAdmin || usuario.rol === "ADMIN");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <header className="flex items-center justify-between border-b border-linea bg-superficie px-4 py-3 lg:hidden">
        <Marca />
        <button className="btn btn-fantasma h-9 w-9 p-0" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <Menu size={20} />
        </button>
      </header>

      <aside
        className={`${menu ? "block" : "hidden"} border-b border-linea bg-superficie lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r`}
      >
        <div className="hidden px-5 pb-4 pt-5 lg:block">
          <Marca />
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-2 lg:flex-1" aria-label="Principal">
          {enlaces.map(({ a, texto, icono: Icono }) => (
            <NavLink
              key={a}
              to={a}
              end={a === "/"}
              onClick={() => setMenu(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.94rem] font-medium ${
                  isActive ? "bg-petroleo-claro text-petroleo-oscuro" : "text-tinta-suave hover:bg-papel hover:text-tinta"
                }`
              }
            >
              <Icono size={17} />
              {texto}
            </NavLink>
          ))}
          <a
            href="/kiosko"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2.5 rounded-md border border-dashed border-linea-fuerte px-3 py-2 text-[0.94rem] font-medium text-tinta-suave hover:border-petroleo hover:text-petroleo"
          >
            <Tablet size={17} />
            Abrir kiosko
          </a>
        </nav>
        <div className="border-t border-linea px-4 py-3">
          <p className="truncate text-[0.92rem] font-semibold">{usuario.nombre}</p>
          <p className="truncate text-[0.82rem] text-tinta-tenue">{usuario.rol === "ADMIN" ? "Administrador" : "Supervisor"}</p>
          <button className="btn btn-fantasma -ml-2 mt-1 h-8 px-2" onClick={salir}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-[1240px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
