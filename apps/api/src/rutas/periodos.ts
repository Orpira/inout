import { z } from "zod";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { motivoObligatorio } from "../servicios/auditoria.js";
import { fechaISO } from "./marcaciones.js";

/** Periodos liquidados: consulta para todos; cerrar y reabrir, solo administradores. */
export const rutasPeriodos: Rutas = (app, ctx) => {
  const r = zapp(app);

  r.get("/", { onRequest: requiereSesion() }, async () => ({ datos: await ctx.periodos.listar() }));

  r.post(
    "/",
    {
      onRequest: requiereSesion("ADMIN"),
      schema: { body: z.object({ desde: fechaISO, hasta: fechaISO, nota: z.string().trim().max(500).nullish() }) },
    },
    async (req, reply) => reply.status(201).send(await ctx.periodos.cerrar(req.user.id, req.body)),
  );

  r.post(
    "/:id/reabrir",
    {
      onRequest: requiereSesion("ADMIN"),
      schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ motivo: motivoObligatorio }) },
    },
    async (req) => ctx.periodos.reabrir(req.user.id, req.params.id, req.body.motivo),
  );
};
