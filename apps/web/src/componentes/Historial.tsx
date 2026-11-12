import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fechaCorta, hora, pesos } from "../lib/formato";

interface Evento {
  id: number;
  entidadId: number;
  accion: string;
  motivo: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  creadoEn: string;
  usuario: string | null;
}

const ACCIONES: Record<string, string> = {
  CREAR: "Alta",
  EDITAR: "Cambio",
  AGREGAR_FESTIVO: "Festivo añadido",
  QUITAR_FESTIVO: "Festivo quitado",
  RESTAURAR_FESTIVO: "Ajuste eliminado",
  CAMBIAR_ZONA_HORARIA: "Zona horaria cambiada",
};

const CAMPOS: Record<string, string> = {
  identificacion: "Identificación",
  nombre: "Nombre",
  apellido: "Apellido",
  cargo: "Cargo",
  email: "Correo",
  telefono: "Teléfono",
  salario: "Salario",
  horarioId: "Horario",
  fechaIngreso: "Fecha de ingreso",
  activo: "Activo",
  tipo: "Tipo",
  dias: "Días y horas",
  descanso: "Descanso",
  toleranciaMinutos: "Tolerancia (min)",
  requiereAprobacion: "Requiere aprobación",
  zona: "Zona horaria",
};

function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (campo === "salario") return pesos(Number(v));
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "object") return "modificado";
  return String(v);
}

/** Historial de cambios auditados de un empleado, un horario o los festivos. */
export function HistorialCambios({ entidad, entidadId }: { entidad: "empleado" | "horario" | "festivo" | "ajuste"; entidadId?: number }) {
  const q = useQuery({
    queryKey: ["auditoria", entidad, entidadId],
    queryFn: () => api<{ datos: Evento[] }>(`/config/auditoria?entidad=${entidad}${entidadId ? `&entidadId=${entidadId}` : ""}`),
  });
  if (!q.data?.datos.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-bold">Historial de cambios</h3>
      <ol className="max-h-64 space-y-3 overflow-y-auto border-l-2 border-linea pl-4">
        {q.data.datos.map((e) => {
          const campos = e.accion === "EDITAR" || e.accion === "CAMBIAR_ZONA_HORARIA" ? Object.keys(e.despues ?? {}) : [];
          return (
            <li key={e.id} className="text-[0.9rem]">
              <p>
                <strong>{ACCIONES[e.accion] ?? e.accion}</strong>
                {entidad === "festivo" && <span className="ml-1 tabular-nums">{String(e.entidadId).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}</span>}
                <span className="text-tinta-suave"> por {e.usuario ?? "el sistema"}, {fechaCorta(e.creadoEn)} {hora(e.creadoEn)}</span>
              </p>
              {e.motivo && <p className="text-tinta-suave">“{e.motivo}”</p>}
              {campos.length > 0 && (
                <ul className="mt-0.5 text-[0.85rem] tabular-nums text-tinta-suave">
                  {campos.map((c) => (
                    <li key={c}>
                      {CAMPOS[c] ?? c}: <span className="line-through">{valor(c, e.antes?.[c])}</span>{" "}
                      <span className="text-tinta">{valor(c, e.despues?.[c])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
