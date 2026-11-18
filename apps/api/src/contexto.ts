import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import { ErrorHttp } from "./errores.js";
import type { ServicioCalendario } from "./servicios/calendario.js";
import type { ServicioMarcaciones } from "./servicios/marcaciones.js";
import type { ServicioOffline } from "./servicios/offline.js";
import type { ServicioPeriodos } from "./servicios/periodos.js";

/** CONSULTA: ve todo lo que ve un supervisor, pero no puede guardar ningún cambio (pensado para demos). */
export type Rol = "ADMIN" | "SUPERVISOR" | "CONSULTA";

const METODOS_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

export interface SesionUsuario {
  id: number;
  nombre: string;
  rol: Rol;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SesionUsuario;
    user: SesionUsuario;
  }
}

export interface Contexto {
  db: Db;
  env: Env;
  calendario: ServicioCalendario;
  marcaciones: ServicioMarcaciones;
  offline: ServicioOffline;
  periodos: ServicioPeriodos;
}

export type Rutas = (app: FastifyInstance, ctx: Contexto) => Promise<void> | void;

export const zapp = (app: FastifyInstance) => app.withTypeProvider<ZodTypeProvider>();

export function requiereSesion(...roles: Rol[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new ErrorHttp(401, "Sesión no válida o expirada", "NO_AUTENTICADO");
    }
    if (roles.length && !roles.includes(req.user.rol)) {
      throw new ErrorHttp(403, "No tienes permisos para esta acción", "PROHIBIDO");
    }
    // El usuario de solo consulta puede leer, nunca escribir: se aplica a todas las rutas con sesión.
    if (req.user.rol === "CONSULTA" && !METODOS_LECTURA.has(req.method)) {
      throw new ErrorHttp(403, "Usuario de solo consulta: puedes ver todo, pero no guardar cambios.", "SOLO_CONSULTA");
    }
  };
}
