import { useMemo } from "react";
import { textoDesfase, todasLasZonas, ZONAS_SUGERIDAS } from "../lib/zona";

/** Lista de ubicaciones (zonas IANA): primero las frecuentes y después todas las que conoce el navegador. */
export function SelectorZona({ id, valor, onCambiar, className = "campo" }: { id: string; valor: string; onCambiar: (zona: string) => void; className?: string }) {
  const otras = useMemo(() => {
    const sugeridas = new Set(ZONAS_SUGERIDAS.map((z) => z.zona));
    return todasLasZonas().filter((z) => !sugeridas.has(z));
  }, []);
  // Una zona guardada que el navegador no lista (p. ej. un alias antiguo) también debe poder mostrarse.
  const conocida = ZONAS_SUGERIDAS.some((z) => z.zona === valor) || otras.includes(valor);

  return (
    <select id={id} className={className} value={valor} onChange={(e) => onCambiar(e.target.value)}>
      {!conocida && valor && <option value={valor}>{valor.replace(/_/g, " ")}</option>}
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
              {z.replace(/_/g, " ")} ({textoDesfase(z)})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
