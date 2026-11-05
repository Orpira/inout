import {
  fechaLocal,
  festivosColombia,
  INICIO_NOCTURNO,
  JORNADA_SEMANAL,
  parametrosVigentes,
  RECARGO_DOMINICAL,
} from "@inout/core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { festivosAjustes } from "../db/schema.js";
import { noEncontrado } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { fechaISO } from "./marcaciones.js";

export const rutasConfig: Rutas = (app, { db, calendario }) => {
  const r = zapp(app);

  r.get(
    "/parametros",
    { onRequest: requiereSesion(), schema: { querystring: z.object({ fecha: fechaISO.optional() }) } },
    async (req) => ({
      vigentes: parametrosVigentes(req.query.fecha ?? fechaLocal(new Date())),
      historico: {
        jornadaSemanal: JORNADA_SEMANAL.slice(1),
        inicioNocturno: INICIO_NOCTURNO.slice(1).map((t) => ({ desde: t.desde, valor: `${t.valor / 60}:00` })),
        recargoDominical: RECARGO_DOMINICAL.slice(1),
      },
    }),
  );

  r.get(
    "/festivos",
    { onRequest: requiereSesion(), schema: { querystring: z.object({ anio: z.coerce.number().int().min(2000).max(2100) }) } },
    async (req) => {
      const cal = await calendario.obtener(db);
      const legales = new Set(festivosColombia(req.query.anio).map((f) => f.fecha));
      const ajustes = (await db.select().from(festivosAjustes)).filter((a) => a.fecha.startsWith(`${req.query.anio}-`));
      return {
        festivos: cal.delAnio(req.query.anio).map((f) => ({ ...f, origen: legales.has(f.fecha) ? "LEY" : "AJUSTE" })),
        ajustes,
      };
    },
  );

  r.post(
    "/festivos/ajustes",
    {
      onRequest: requiereSesion("ADMIN"),
      schema: {
        body: z.object({
          fecha: fechaISO,
          tipo: z.enum(["AGREGAR", "QUITAR"]),
          descripcion: z.string().trim().max(200).nullish(),
        }),
      },
    },
    async (req, reply) => {
      const [a] = await db
        .insert(festivosAjustes)
        .values({ ...req.body, descripcion: req.body.descripcion ?? null })
        .onConflictDoUpdate({ target: festivosAjustes.fecha, set: { tipo: req.body.tipo, descripcion: req.body.descripcion ?? null } })
        .returning();
      calendario.invalidar();
      reply.code(201);
      return a;
    },
  );

  r.delete(
    "/festivos/ajustes/:fecha",
    { onRequest: requiereSesion("ADMIN"), schema: { params: z.object({ fecha: fechaISO }) } },
    async (req) => {
      const borrados = await db.delete(festivosAjustes).where(eq(festivosAjustes.fecha, req.params.fecha)).returning();
      if (!borrados.length) throw noEncontrado("Ajuste");
      calendario.invalidar();
      return { ok: true };
    },
  );
};
