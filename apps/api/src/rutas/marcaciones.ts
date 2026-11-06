import { desdeLocal, sumarDias } from "@inout/core";
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditoria, empleados, liquidacionLineas, marcaciones, marcasOffline, usuarios } from "../db/schema.js";
import { noEncontrado } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";

export const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");
const instante = z.string().datetime({ offset: true }).transform((v) => new Date(v));
const motivo = z.string().trim().min(5, "Explica el motivo (mínimo 5 caracteres)").max(500);
const id = z.object({ id: z.coerce.number().int() });

export const columnasMarcacion = {
  id: marcaciones.id,
  empleadoId: marcaciones.empleadoId,
  entrada: marcaciones.entrada,
  salida: marcaciones.salida,
  estado: marcaciones.estado,
  origen: marcaciones.origen,
  observacion: marcaciones.observacion,
  minutosTotales: marcaciones.minutosTotales,
  minutosExtra: marcaciones.minutosExtra,
  minutosExtraCalculados: marcaciones.minutosExtraCalculados,
  minutosExtraAprobados: marcaciones.minutosExtraAprobados,
  minutosDescanso: marcaciones.minutosDescanso,
  estadoExtras: marcaciones.estadoExtras,
  valorRecargos: marcaciones.valorRecargos,
  alertas: marcaciones.alertas,
  empleado: {
    id: empleados.id,
    nombre: empleados.nombre,
    apellido: empleados.apellido,
    identificacion: empleados.identificacion,
    cargo: empleados.cargo,
  },
};

export const rutasMarcaciones: Rutas = (app, ctx) => {
  const { db } = ctx;
  const r = zapp(app);
  const sesion = requiereSesion();

  r.get(
    "/",
    {
      onRequest: sesion,
      schema: {
        querystring: z.object({
          desde: fechaISO.optional(),
          hasta: fechaISO.optional(),
          empleadoId: z.coerce.number().int().optional(),
          estado: z.enum(["ABIERTA", "CERRADA", "REVISION", "ANULADA"]).optional(),
          q: z.string().optional(),
          soloExtras: z.coerce.boolean().optional(),
          estadoExtras: z.enum(["SIN_EXTRAS", "TOLERANCIA", "PENDIENTE", "APROBADAS", "RECHAZADAS", "AUTOMATICAS"]).optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          porPagina: z.coerce.number().int().min(5).max(200).default(25),
        }),
      },
    },
    async (req) => {
      const f = req.query;
      const filtros: (SQL | undefined)[] = [
        f.desde ? gte(marcaciones.entrada, desdeLocal(f.desde)) : undefined,
        f.hasta ? lt(marcaciones.entrada, desdeLocal(sumarDias(f.hasta, 1))) : undefined,
        f.empleadoId ? eq(marcaciones.empleadoId, f.empleadoId) : undefined,
        f.estado ? eq(marcaciones.estado, f.estado) : undefined,
        f.soloExtras ? sql`${marcaciones.minutosExtraCalculados} > 0` : undefined,
        f.estadoExtras ? eq(marcaciones.estadoExtras, f.estadoExtras) : undefined,
      ];
      if (f.q) {
        const p = `%${f.q.trim()}%`;
        filtros.push(
          or(
            ilike(sql`${empleados.nombre} || ' ' || ${empleados.apellido}`, p),
            ilike(empleados.identificacion, p),
          ),
        );
      }
      const where = and(...filtros);
      const [datos, [total]] = await Promise.all([
        db
          .select(columnasMarcacion)
          .from(marcaciones)
          .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
          .where(where)
          .orderBy(desc(marcaciones.entrada))
          .limit(f.porPagina)
          .offset((f.pagina - 1) * f.porPagina),
        db
          .select({ n: count() })
          .from(marcaciones)
          .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
          .where(where),
      ]);
      return { datos, total: total?.n ?? 0, pagina: f.pagina, porPagina: f.porPagina };
    },
  );

  r.get("/:id", { onRequest: sesion, schema: { params: id } }, async (req) => {
    const [m] = await db
      .select(columnasMarcacion)
      .from(marcaciones)
      .innerJoin(empleados, eq(empleados.id, marcaciones.empleadoId))
      .where(eq(marcaciones.id, req.params.id));
    if (!m) throw noEncontrado("Marcación");
    const [lineas, historial] = await Promise.all([
      db.select().from(liquidacionLineas).where(eq(liquidacionLineas.marcacionId, m.id)).orderBy(asc(liquidacionLineas.id)),
      db
        .select({
          id: auditoria.id,
          accion: auditoria.accion,
          motivo: auditoria.motivo,
          antes: auditoria.antes,
          despues: auditoria.despues,
          creadoEn: auditoria.creadoEn,
          usuario: usuarios.nombre,
        })
        .from(auditoria)
        .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
        .where(and(eq(auditoria.entidad, "marcacion"), eq(auditoria.entidadId, m.id)))
        .orderBy(desc(auditoria.creadoEn)),
    ]);
    return { ...m, lineas, historial };
  });

  r.post(
    "/",
    {
      onRequest: sesion,
      schema: {
        body: z.object({
          empleadoId: z.number().int(),
          entrada: instante,
          salida: instante.nullish(),
          observacion: z.string().trim().max(1000).nullish(),
          motivo,
        }),
      },
    },
    async (req, reply) => {
      const m = await ctx.marcaciones.crearManual(req.user.id, { ...req.body, salida: req.body.salida ?? null });
      reply.code(201);
      return m;
    },
  );

  r.patch(
    "/:id",
    {
      onRequest: sesion,
      schema: {
        params: id,
        body: z.object({
          entrada: instante.optional(),
          salida: instante.nullish(),
          observacion: z.string().trim().max(1000).nullish(),
          motivo,
        }),
      },
    },
    async (req) => ctx.marcaciones.editar(req.user.id, req.params.id, req.body),
  );

  r.post(
    "/:id/anular",
    { onRequest: sesion, schema: { params: id, body: z.object({ motivo }) } },
    async (req) => ctx.marcaciones.anular(req.user.id, req.params.id, req.body.motivo),
  );

  r.post(
    "/:id/extras",
    {
      onRequest: sesion,
      schema: {
        params: id,
        body: z.object({
          aprobar: z.boolean(),
          minutos: z.number().int().min(1).nullish(),
          motivo: z.string().trim().max(500).nullish(),
        }),
      },
    },
    async (req) => ctx.marcaciones.revisarExtras(req.user.id, req.params.id, req.body),
  );

  r.post(
    "/extras/aprobar-lote",
    { onRequest: sesion, schema: { body: z.object({ ids: z.array(z.number().int()).min(1).max(500) }) } },
    async (req) => ({ aprobadas: await ctx.marcaciones.aprobarExtrasEnLote(req.user.id, req.body.ids) }),
  );

  r.get(
    "/offline",
    { onRequest: sesion, schema: { querystring: z.object({ estado: z.enum(["APLICADA", "RECHAZADA", "RESUELTA"]).default("RECHAZADA") }) } },
    async (req) => ({
      datos: await db
        .select({
          id: marcasOffline.id,
          codigo: marcasOffline.codigo,
          capturadoEn: marcasOffline.capturadoEn,
          recibidoEn: marcasOffline.recibidoEn,
          desfaseSegundos: marcasOffline.desfaseSegundos,
          dispositivo: marcasOffline.dispositivo,
          estado: marcasOffline.estado,
          mensaje: marcasOffline.mensaje,
          notaResolucion: marcasOffline.notaResolucion,
          empleado: sql<string | null>`${empleados.nombre} || ' ' || ${empleados.apellido}`,
          empleadoId: empleados.id,
        })
        .from(marcasOffline)
        .leftJoin(empleados, eq(empleados.identificacion, marcasOffline.codigo))
        .where(eq(marcasOffline.estado, req.query.estado))
        .orderBy(desc(marcasOffline.capturadoEn))
        .limit(200),
    }),
  );

  r.post(
    "/offline/:id/resolver",
    {
      onRequest: sesion,
      schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ nota: z.string().trim().min(5, "Explica cómo se resolvió").max(500) }) },
    },
    async (req) => ctx.offline.resolver(req.user.id, req.params.id, req.body.nota),
  );

  r.post(
    "/recalcular",
    {
      onRequest: requiereSesion("ADMIN"),
      schema: { body: z.object({ desde: fechaISO, hasta: fechaISO, empleadoId: z.number().int().optional() }) },
    },
    async (req) => ({ diasRecalculados: await ctx.marcaciones.recalcularRango(req.body.desde, req.body.hasta, req.body.empleadoId) }),
  );
};
