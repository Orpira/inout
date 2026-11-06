import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { empleados, marcaciones as marcacionesT } from "../db/schema.js";
import { ErrorHttp } from "../errores.js";
import { zapp, type Rutas } from "../contexto.js";

/**
 * Endpoints públicos del kiosko de marcación. Si KIOSKO_TOKEN está configurado,
 * el dispositivo debe enviarlo en la cabecera `x-kiosko-token`.
 */
export const rutasKiosko: Rutas = (app, { db, env, marcaciones, offline }) => {
  const r = zapp(app);

  app.addHook("onRequest", async (req) => {
    if (env.KIOSKO_TOKEN && req.headers["x-kiosko-token"] !== env.KIOSKO_TOKEN) {
      throw new ErrorHttp(401, "Dispositivo de kiosko no autorizado", "KIOSKO_NO_AUTORIZADO");
    }
  });

  const limite = { rateLimit: { max: 60, timeWindow: "1 minute" } };
  const codigo = z.string().trim().min(1).max(40);

  r.get(
    "/empleado/:codigo",
    { config: limite, schema: { params: z.object({ codigo }) } },
    async (req) => marcaciones.buscarEmpleadoPorCodigo(req.params.codigo),
  );

  r.post(
    "/marcar",
    { config: limite, schema: { body: z.object({ codigo }) } },
    async (req) => {
      const r = await marcaciones.marcar(req.body.codigo);
      return {
        tipo: r.tipo,
        empleado: r.empleado,
        aviso: r.aviso ?? null,
        marcacion: {
          id: r.marcacion.id,
          entrada: r.marcacion.entrada,
          salida: r.marcacion.salida,
          minutosTotales: r.marcacion.minutosTotales,
          minutosExtra: r.marcacion.minutosExtra,
          minutosExtraCalculados: r.marcacion.minutosExtraCalculados,
          estadoExtras: r.marcacion.estadoExtras,
        },
      };
    },
  );

  /**
   * Directorio de empleados activos para validar códigos y mostrar nombres sin conexión.
   * Solo disponible con KIOSKO_TOKEN configurado, para no exponer la nómina públicamente.
   */
  r.get("/directorio", { config: limite }, async () => {
    if (!env.KIOSKO_TOKEN) {
      throw new ErrorHttp(403, "Configura KIOSKO_TOKEN para habilitar el directorio sin conexión", "DIRECTORIO_DESHABILITADO");
    }
    const filas = await db
      .select({
        identificacion: empleados.identificacion,
        nombre: empleados.nombre,
        apellido: empleados.apellido,
        cargo: empleados.cargo,
        abiertaDesde: marcacionesT.entrada,
      })
      .from(empleados)
      .leftJoin(marcacionesT, and(eq(marcacionesT.empleadoId, empleados.id), eq(marcacionesT.estado, "ABIERTA")))
      .where(eq(empleados.activo, true));
    return { generadoEn: new Date().toISOString(), empleados: filas };
  });

  /** Recibe en lote las marcaciones capturadas sin conexión. */
  r.post(
    "/sincronizar",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: z.object({
          enviadoEn: z.string().datetime({ offset: true }).transform((v) => new Date(v)),
          dispositivo: z.string().trim().max(80).nullish(),
          marcas: z
            .array(
              z.object({
                id: z.string().uuid(),
                codigo,
                capturadoEn: z.string().datetime({ offset: true }).transform((v) => new Date(v)),
              }),
            )
            .max(500),
        }),
      },
    },
    async (req) => ({
      resultados: await offline.sincronizar(req.body.marcas, req.body.enviadoEn, req.body.dispositivo ?? null),
    }),
  );
};
