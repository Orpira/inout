import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { nombreCompleto } from "../lib/formato";
import type { Empleado } from "../lib/tipos";

const MAX_VISIBLES = 8;
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Buscador de un empleado por nombre o identificación (combobox accesible).
 * Pensado para plantillas grandes: muestra solo las primeras coincidencias
 * y pide seguir escribiendo en vez de listar a todos.
 */
export function SelectorEmpleado({
  id,
  empleados,
  valor,
  onCambiar,
  textoVacio = "Todos los empleados",
  cargando = false,
}: {
  id: string;
  empleados: Empleado[];
  valor: number | null;
  onCambiar: (id: number | null) => void;
  textoVacio?: string;
  cargando?: boolean;
}) {
  const lista = useId();
  const input = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const elegido = empleados.find((e) => e.id === valor) ?? null;

  const indice = useMemo(
    () => empleados.map((e) => ({ e, clave: normalizar(`${nombreCompleto(e)} ${e.apellido} ${e.nombre} ${e.identificacion}`) })),
    [empleados],
  );
  const coincidencias = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return indice.filter((x) => palabras.every((p) => x.clave.includes(p))).map((x) => x.e);
  }, [indice, texto]);
  const visibles = coincidencias.slice(0, MAX_VISIBLES);

  const abrir = () => {
    setTexto("");
    setActivo(0);
    setAbierto(true);
  };
  const cerrar = () => setAbierto(false);
  const elegir = (e: Empleado | null) => {
    onCambiar(e ? e.id : null);
    cerrar();
    input.current?.blur();
  };

  return (
    <div className="relative w-72" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && cerrar()}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tinta-tenue" aria-hidden />
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && visibles[activo] ? `${lista}-${visibles[activo].id}` : undefined}
        autoComplete="off"
        className="campo pl-8 pr-8 placeholder:text-tinta-suave"
        placeholder={abierto ? "Nombre o identificación" : cargando ? "Cargando…" : textoVacio}
        value={abierto ? texto : elegido ? nombreCompleto(elegido) : ""}
        onFocus={abrir}
        onClick={() => !abierto && abrir()}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cerrar();
            input.current?.blur();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!abierto) return abrir();
            const n = visibles.length;
            if (n) setActivo((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
          } else if (e.key === "Enter" && abierto) {
            e.preventDefault();
            if (visibles[activo]) elegir(visibles[activo]);
          }
        }}
      />
      {elegido && !abierto && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-tinta-suave hover:bg-papel"
          aria-label={`Quitar filtro de ${nombreCompleto(elegido)}`}
          onClick={() => elegir(null)}
        >
          <X size={15} />
        </button>
      )}

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-linea-fuerte bg-superficie shadow-lg">
          <ul id={lista} role="listbox" aria-label="Empleados" className="max-h-80 overflow-y-auto py-1">
            {visibles.map((e, i) => (
              <li
                key={e.id}
                id={`${lista}-${e.id}`}
                role="option"
                aria-selected={e.id === valor}
                // mousedown: elige antes de que el campo pierda el foco
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  elegir(e);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${i === activo ? "bg-petroleo-claro" : ""}`}
              >
                <span className={`truncate ${e.id === valor ? "font-semibold" : ""}`}>
                  {nombreCompleto(e)}
                  {!e.activo && <span className="ml-1.5 text-[0.8rem] text-tinta-tenue">inactivo</span>}
                </span>
                <span className="shrink-0 text-[0.82rem] tabular-nums text-tinta-tenue">{e.identificacion}</span>
              </li>
            ))}
          </ul>
          {visibles.length === 0 ? (
            <p className="px-3 py-2.5 text-[0.9rem] text-tinta-suave">{cargando ? "Cargando empleados…" : "Ningún empleado coincide."}</p>
          ) : (
            coincidencias.length > visibles.length && (
              <p className="border-t border-linea px-3 py-1.5 text-[0.82rem] text-tinta-suave">
                {visibles.length} de {coincidencias.length}. Escribe para acotar.
              </p>
            )
          )}
          {elegido && (
            <button
              type="button"
              className="block w-full border-t border-linea px-3 py-2 text-left text-[0.9rem] font-medium text-petroleo hover:bg-papel"
              onMouseDown={(ev) => {
                ev.preventDefault();
                elegir(null);
              }}
            >
              {textoVacio}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
