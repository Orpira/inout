import { fechaLocal, horarioLegalPorDefecto, salidaProgramada } from "@inout/core";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { empleados, horarios, marcaciones as marcacionesT, sucursales } from "../db/schema.js";
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
  /** Dónde y con qué turno se marca (kioskos asociados a una sucursal). Todo opcional: los kioskos antiguos no lo envían. */
  const contexto = {
    sucursalId: z.number().int().nullish(),
    turno: z.object({ horarioId: z.number().int().nullable() }).nullish(),
    ubicacion: z
      .object({ latitud: z.number().min(-90).max(90), longitud: z.number().min(-180).max(180), precisionMetros: z.number().min(0).nullish() })
      .nullish(),
  };

  /** Sucursales activas, para asociar el kiosko a una de ellas (la más cercana se propone por GPS). */
  r.get("/sucursales", { config: limite }, async () => ({
    datos: await db
      .select({ id: sucursales.id, codigo: sucursales.codigo, nombre: sucursales.nombre, ciudad: sucursales.ciudad, latitud: sucursales.latitud, longitud: sucursales.longitud, radioMetros: sucursales.radioMetros })
      .from(sucursales)
      .where(eq(sucursales.activa, true))
      .orderBy(asc(sucursales.nombre)),
  }));

  r.get(
    "/empleado/:codigo",
    { config: limite, schema: { params: z.object({ codigo }) } },
    async (req) => marcaciones.buscarEmpleadoPorCodigo(req.params.codigo),
  );

  r.post(
    "/marcar",
    { config: limite, schema: { body: z.object({ codigo, ...contexto }) } },
    async (req) => {
      const { codigo, sucursalId, turno, ubicacion } = req.body;
      // Entrada en una sucursal que no es la del empleado: primero debe elegir el turno que va a realizar.
      if (!turno) {
        const eleccion = await marcaciones.turnoParaEntrada(codigo, sucursalId);
        if (eleccion) return { tipo: "ELEGIR_TURNO" as const, ...eleccion };
      }
      const r = await marcaciones.marcar(codigo, { sucursalId, turno, ubicacion });
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
        horario: horarios,
        sucursalId: empleados.sucursalId,
        horarioId: empleados.horarioId,
      })
      .from(empleados)
      .leftJoin(marcacionesT, and(eq(marcacionesT.empleadoId, empleados.id), eq(marcacionesT.estado, "ABIERTA")))
      .leftJoin(horarios, eq(horarios.id, empleados.horarioId))
      .where(eq(empleados.activo, true));
    // Con esto el kiosko puede pedir el turno sin conexión cuando alguien marca en otra sucursal.
    const turnos = await db
      .select({ id: horarios.id, nombre: horarios.nombre, sucursalId: horarios.sucursalId })
      .from(horarios)
      .where(eq(horarios.activo, true))
      .orderBy(asc(horarios.nombre));
    const sedes = await db.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales);
    return {
      generadoEn: new Date().toISOString(),
      turnos,
      sucursales: sedes,
      // Con más horas sin salida, el kiosko da el turno por cerrado y la marcación es una entrada nueva.
      maxHorasTurno: env.MAX_HORAS_TURNO,
      empleados: filas.map(({ horario, ...e }) => ({
        ...e,
        // Con esto el kiosko puede decir, sin conexión, con qué hora se cerrará un turno olvidado.
        salidaProgramada: e.abiertaDesde ? salidaProgramada(horario ?? horarioLegalPorDefecto(fechaLocal(e.abiertaDesde)), e.abiertaDesde) : null,
      })),
    };
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
                ...contexto,
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
