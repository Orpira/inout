import { fechaLocal, minutosHorarioFijo, validarHorario, type Horario } from "@inout/core";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { empleados, horarios } from "../db/schema.js";
import { noEncontrado, solicitudInvalida } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");

const esquemaHorario = z.object({
  nombre: z.string().trim().min(2).max(80),
  tipo: z.enum(["FIJO", "TURNOS"]),
  dias: z
    .array(
      z.object({
        laborable: z.boolean(),
        minutos: z.number().int().min(0).max(24 * 60).default(0),
        inicio: hora.nullish(),
        fin: hora.nullish(),
      }),
    )
    .length(7),
  descanso: z
    .discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("VENTANA"), inicio: hora, fin: hora }),
      z.object({ tipo: z.literal("DURACION"), minutos: z.number().int(), despuesDe: z.number().int().min(0).max(16 * 60) }),
    ])
    .nullable(),
  toleranciaMinutos: z.number().int().min(0).max(120).default(0),
  requiereAprobacion: z.boolean().default(false),
  activo: z.boolean().default(true),
});

/** Normaliza el horario: en FIJO los minutos salen de entrada/salida; los días no laborables quedan en 0. */
function normalizar(h: z.infer<typeof esquemaHorario>): Horario & { nombre: string; activo: boolean } {
  return {
    ...h,
    dias: h.dias.map((d) => {
      if (!d.laborable) return { laborable: false, minutos: 0, inicio: null, fin: null };
      if (h.tipo === "FIJO" && d.inicio && d.fin) {
        return { laborable: true, inicio: d.inicio, fin: d.fin, minutos: minutosHorarioFijo(d.inicio, d.fin, h.descanso) };
      }
      return { laborable: true, minutos: d.minutos, inicio: null, fin: null };
    }),
  };
}

export const rutasHorarios: Rutas = (app, { db }) => {
  const r = zapp(app);
  const admin = requiereSesion("ADMIN");

  r.get("/", { onRequest: requiereSesion() }, async () => {
    const filas = await db
      .select({ horario: horarios, empleados: count(empleados.id) })
      .from(horarios)
      .leftJoin(empleados, eq(empleados.horarioId, horarios.id))
      .groupBy(horarios.id)
      .orderBy(asc(horarios.nombre));
    const hoy = fechaLocal(new Date());
    return {
      datos: filas.map((f) => ({ ...f.horario, empleados: f.empleados, validacion: validarHorario(f.horario, hoy) })),
    };
  });

  const guardar = (h: z.infer<typeof esquemaHorario>) => {
    const n = normalizar(h);
    const v = validarHorario(n, fechaLocal(new Date()));
    if (v.errores.length) throw solicitudInvalida(v.errores.join(" "));
    return n;
  };

  r.post("/", { onRequest: admin, schema: { body: esquemaHorario } }, async (req, reply) => {
    const [h] = await db.insert(horarios).values(guardar(req.body)).returning();
    reply.code(201);
    return h;
  });

  r.put(
    "/:id",
    { onRequest: admin, schema: { params: z.object({ id: z.coerce.number().int() }), body: esquemaHorario } },
    async (req) => {
      const [h] = await db.update(horarios).set(guardar(req.body)).where(eq(horarios.id, req.params.id)).returning();
      if (!h) throw noEncontrado("Horario");
      return h;
    },
  );
};
