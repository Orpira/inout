import { z } from "zod";
import { ErrorHttp } from "../errores.js";
import { zapp, type Rutas } from "../contexto.js";

/**
 * Endpoints públicos del kiosko de marcación. Si KIOSKO_TOKEN está configurado,
 * el dispositivo debe enviarlo en la cabecera `x-kiosko-token`.
 */
export const rutasKiosko: Rutas = (app, { env, marcaciones }) => {
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
    {
      config: limite,
      schema: {
        body: z.object({
          codigo,
          /** Momento de captura cuando la marcación se hizo sin conexión. */
          capturadoEn: z.string().datetime({ offset: true }).optional(),
        }),
      },
    },
    async (req) => {
      const momento = req.body.capturadoEn ? new Date(req.body.capturadoEn) : undefined;
      const r = await marcaciones.marcar(req.body.codigo, { momento, offline: !!momento });
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
        },
      };
    },
  );
};
