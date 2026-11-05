import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { ZONA_HORARIA, fechaLocal, horaLocal } from '@inout/core';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { z } from 'zod';
import { COOKIE_SESION, type Sesion, verificarClave } from './auth.js';
import { config } from './config.js';
import type { Db } from './db/index.js';
import { usuarios } from './db/schema.js';
import { marcar } from './marcaciones.js';
import { ErrorHttp } from './rutas/comun.js';
import { rutasEmpleados } from './rutas/empleados.js';
import { rutasFestivos } from './rutas/festivos.js';
import { rutasLiquidacion } from './rutas/liquidacion.js';
import { rutasMarcaciones } from './rutas/marcaciones.js';
import { rutasTurnos } from './rutas/turnos.js';
import { rutasUsuarios } from './rutas/usuarios.js';

const DURACION_SESION_S = 12 * 3600;

export async function crearApp(db: Db) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: COOKIE_SESION, signed: false },
    sign: { expiresIn: DURACION_SESION_S },
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ErrorHttp) return reply.code(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno' });
  });

  app.get('/api/salud', async () => {
    const ahora = new Date();
    return { ok: true, zona: ZONA_HORARIA, fecha: fechaLocal(ahora), hora: horaLocal(ahora), utc: ahora.toISOString() };
  });

  // --- Kiosko (sin sesión: identifica al empleado por documento) ---
  app.post('/api/kiosko/marcar', async (req, reply) => {
    const cuerpo = z.object({ documento: z.string().trim().min(3).max(20) }).safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: 'Documento inválido' });
    const r = await marcar(db, cuerpo.data.documento);
    if (!r.ok) return reply.code(r.codigo === 'NO_ENCONTRADO' ? 404 : 409).send({ error: r.mensaje, codigo: r.codigo });
    return {
      tipo: r.tipo,
      empleado: r.empleado,
      fecha: fechaLocal(r.instante),
      hora: horaLocal(r.instante),
      aviso: r.aviso,
    };
  });

  // --- Sesión ---
  app.post('/api/auth/login', async (req, reply) => {
    const cuerpo = z.object({ email: z.email(), clave: z.string().min(1) }).safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, cuerpo.data.email.toLowerCase()));
    if (!u || !u.activo || !(await verificarClave(cuerpo.data.clave, u.hashClave))) {
      return reply.code(401).send({ error: 'Credenciales incorrectas' });
    }
    const token = await reply.jwtSign({ id: u.id, rol: u.rol, nombre: u.nombre });
    return reply
      .setCookie(COOKIE_SESION, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.NODE_ENV === 'production',
        path: '/',
        maxAge: DURACION_SESION_S,
      })
      .send({ id: u.id, nombre: u.nombre, rol: u.rol });
  });

  app.post('/api/auth/logout', async (_req, reply) => reply.clearCookie(COOKIE_SESION, { path: '/' }).send({ ok: true }));

  // Consulta de sesión: sin sesión responde 200 con null (no es un error, solo
  // indica al panel que muestre el login).
  app.get('/api/auth/yo', async (req) => {
    try {
      const { id, rol, nombre } = await req.jwtVerify<Sesion>({ onlyCookie: true });
      return { sesion: { id, rol, nombre } };
    } catch {
      return { sesion: null };
    }
  });

  // --- Panel ---
  rutasEmpleados(app, db);
  rutasMarcaciones(app, db);
  rutasLiquidacion(app, db);
  rutasFestivos(app, db);
  rutasUsuarios(app, db);
  rutasTurnos(app, db);

  // --- Frontend (producción: un solo proceso y origen) ---
  const webDist = config.WEB_DIST ? resolve(config.WEB_DIST) : undefined;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'No encontrado' });
    });
  }

  return app;
}
