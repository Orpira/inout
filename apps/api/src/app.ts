import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { ZONA_HORARIA, fechaLocal, festivosDelAnio, horaLocal } from '@inout/core';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { z } from 'zod';
import { COOKIE_SESION, requiereRol, verificarClave } from './auth.js';
import { config } from './config.js';
import type { Db } from './db/index.js';
import { ajustesFestivos, usuarios } from './db/schema.js';
import { marcar } from './marcaciones.js';

const DURACION_SESION_S = 12 * 3600;

export async function crearApp(db: Db) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: COOKIE_SESION, signed: false },
    sign: { expiresIn: DURACION_SESION_S },
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

  app.get('/api/auth/yo', { preHandler: requiereRol() }, async (req) => req.user);

  // --- Calendario ---
  app.get('/api/festivos/:anio', { preHandler: requiereRol() }, async (req, reply) => {
    const p = z.object({ anio: z.coerce.number().int().min(2000).max(2100) }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'Año inválido' });
    const ajustes = await db.select().from(ajustesFestivos);
    return festivosDelAnio(p.data.anio, ajustes.map((a) => ({ ...a, nombre: a.nombre ?? undefined })));
  });

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
