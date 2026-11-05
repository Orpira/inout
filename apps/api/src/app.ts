import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Contexto } from "./contexto.js";
import { crearDb, type Db } from "./db/client.js";
import type { Env } from "./env.js";
import { ErrorHttp } from "./errores.js";
import { COOKIE_SESION, rutasAuth } from "./rutas/auth.js";
import { rutasConfig } from "./rutas/config.js";
import { rutasDashboard } from "./rutas/dashboard.js";
import { rutasEmpleados } from "./rutas/empleados.js";
import { rutasHorarios } from "./rutas/horarios.js";
import { rutasKiosko } from "./rutas/kiosko.js";
import { rutasMarcaciones } from "./rutas/marcaciones.js";
import { rutasReportes } from "./rutas/reportes.js";
import { rutasUsuarios } from "./rutas/usuarios.js";
import { ServicioCalendario } from "./servicios/calendario.js";
import { ServicioMarcaciones } from "./servicios/marcaciones.js";
import { ServicioOffline } from "./servicios/offline.js";

export async function construirApp(env: Env, opciones: { db?: Db; logger?: boolean } = {}) {
  const { db, cliente } = opciones.db ? { db: opciones.db, cliente: null } : crearDb(env.DATABASE_URL);
  const calendario = new ServicioCalendario();
  const svcMarcaciones = new ServicioMarcaciones(db, calendario, env);
  const ctx: Contexto = { db, env, calendario, marcaciones: svcMarcaciones, offline: new ServicioOffline(db, svcMarcaciones) };

  const app = Fastify({
    logger: opciones.logger ?? env.NODE_ENV !== "test",
    trustProxy: true,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("ctx", ctx);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  });
  if (env.CORS_ORIGIN) {
    await app.register(cors, { origin: env.CORS_ORIGIN.split(","), credentials: true });
  }
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET, cookie: { cookieName: COOKIE_SESION, signed: false } });
  await app.register(rateLimit, { global: false, allowList: () => env.NODE_ENV === "test" });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ErrorHttp) {
      return reply.status(err.status).send({ error: err.message, codigo: err.codigo });
    }
    if (err.validation) {
      const detalles = err.validation.map((v) => ({
        campo: v.instancePath.replace(/^\//, "").replace(/\//g, ".") || null,
        mensaje: v.message,
      }));
      return reply.status(400).send({
        error: detalles.map((d) => (d.campo ? `${d.campo}: ${d.mensaje}` : d.mensaje)).join(". "),
        codigo: "VALIDACION",
        detalles,
      });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: "Demasiadas solicitudes, intenta en un momento.", codigo: "LIMITE" });
    }
    // Violaciones de restricciones de PostgreSQL
    const pg = (err as unknown as { code?: string; cause?: { code?: string } }).cause ?? err;
    if ((pg as { code?: string }).code === "23505") {
      return reply.status(409).send({ error: "El registro ya existe o entra en conflicto con otro.", codigo: "CONFLICTO" });
    }
    if ((err.statusCode ?? 500) < 500) {
      return reply.status(err.statusCode!).send({ error: err.message, codigo: err.code });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "Error interno del servidor", codigo: "INTERNO" });
  });

  app.get("/api/salud", async () => {
    await db.execute("select 1");
    return { ok: true, hora: new Date().toISOString() };
  });

  const modulos = [
    ["/api/auth", rutasAuth],
    ["/api/kiosko", rutasKiosko],
    ["/api/empleados", rutasEmpleados],
    ["/api/horarios", rutasHorarios],
    ["/api/marcaciones", rutasMarcaciones],
    ["/api/reportes", rutasReportes],
    ["/api/dashboard", rutasDashboard],
    ["/api/config", rutasConfig],
    ["/api/usuarios", rutasUsuarios],
  ] as const;
  for (const [prefix, rutas] of modulos) {
    await app.register(async (sub) => rutas(sub, ctx), { prefix });
  }

  // Frontend compilado (SPA) servido desde el mismo origen.
  const webDist = env.WEB_DIST ? resolve(env.WEB_DIST) : null;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      setHeaders: (res, ruta) => {
        // Los assets llevan hash en el nombre: caché larga. El HTML nunca se cachea.
        res.header("Cache-Control", ruta.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const ruta = req.url.split("?")[0]!;
      const esPagina = req.method === "GET" && !ruta.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(ruta);
      if (esPagina) return reply.header("Cache-Control", "no-cache").sendFile("index.html");
      return reply.status(404).send({ error: "Ruta no encontrada", codigo: "NO_ENCONTRADO" });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: "Ruta no encontrada", codigo: "NO_ENCONTRADO" }));
  }

  app.addHook("onClose", async () => {
    await cliente?.end({ timeout: 5 });
  });

  return { app, ctx };
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: Contexto;
  }
}
