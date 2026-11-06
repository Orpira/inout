import {
  fechaLocal,
  festivosColombia,
  INICIO_NOCTURNO,
  JORNADA_SEMANAL,
  parametrosVigentes,
  RECARGO_DOMINICAL,
} from "@inout/core";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditoria, festivosAjustes, usuarios } from "../db/schema.js";
import { noEncontrado } from "../errores.js";
import { auditar, idFecha, motivoObligatorio } from "../servicios/auditoria.js";
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
          motivo: motivoObligatorio,
        }),
      },
    },
    async (req, reply) => {
      const { motivo, ...datos } = req.body;
      const a = await db.transaction(async (tx) => {
        const [antes] = await tx.select().from(festivosAjustes).where(eq(festivosAjustes.fecha, datos.fecha));
        const [a] = await tx
          .insert(festivosAjustes)
          .values({ ...datos, descripcion: datos.descripcion ?? null })
          .onConflictDoUpdate({ target: festivosAjustes.fecha, set: { tipo: datos.tipo, descripcion: datos.descripcion ?? null } })
          .returning();
        await auditar(tx, {
          entidad: "festivo",
          entidadId: idFecha(datos.fecha),
          usuarioId: req.user.id,
          accion: datos.tipo === "AGREGAR" ? "AGREGAR_FESTIVO" : "QUITAR_FESTIVO",
          motivo,
          antes: antes ?? null,
          despues: a,
        });
        return a;
      });
      calendario.invalidar();
      reply.code(201);
      return a;
    },
  );

  r.delete(
    "/festivos/ajustes/:fecha",
    { onRequest: requiereSesion("ADMIN"), schema: { params: z.object({ fecha: fechaISO }), body: z.object({ motivo: motivoObligatorio }) } },
    async (req) => {
      await db.transaction(async (tx) => {
        const borrados = await tx.delete(festivosAjustes).where(eq(festivosAjustes.fecha, req.params.fecha)).returning();
        if (!borrados.length) throw noEncontrado("Ajuste");
        await auditar(tx, {
          entidad: "festivo",
          entidadId: idFecha(req.params.fecha),
          usuarioId: req.user.id,
          accion: "RESTAURAR_FESTIVO",
          motivo: req.body.motivo,
          antes: borrados[0],
          despues: null,
        });
      });
      calendario.invalidar();
      return { ok: true };
    },
  );

  /** Historial de cambios de una entidad (o de todas las de un tipo). */
  r.get(
    "/auditoria",
    {
      onRequest: requiereSesion(),
      schema: {
        querystring: z.object({
          entidad: z.enum(["empleado", "horario", "festivo"]),
          entidadId: z.coerce.number().int().optional(),
        }),
      },
    },
    async (req) => ({
      datos: await db
        .select({
          id: auditoria.id,
          entidadId: auditoria.entidadId,
          accion: auditoria.accion,
          motivo: auditoria.motivo,
          antes: auditoria.antes,
          despues: auditoria.despues,
          creadoEn: auditoria.creadoEn,
          usuario: usuarios.nombre,
        })
        .from(auditoria)
        .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
        .where(and(eq(auditoria.entidad, req.query.entidad), req.query.entidadId ? eq(auditoria.entidadId, req.query.entidadId) : undefined))
        .orderBy(desc(auditoria.creadoEn))
        .limit(100),
    }),
  );
};
