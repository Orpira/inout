import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashearClave, requiereRol } from '../auth.js';
import type { Db } from '../db/index.js';
import { usuarios } from '../db/schema.js';
import { ErrorHttp, auditar, validar, zId, zMotivo } from './comun.js';

const columnas = { id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo };
const zClave = z.string().min(10, 'la clave debe tener al menos 10 caracteres').max(200);

export function rutasUsuarios(app: FastifyInstance, db: Db) {
  const soloAdmin = { preHandler: requiereRol('ADMIN') };

  app.get('/api/usuarios', soloAdmin, async () => db.select(columnas).from(usuarios).orderBy(asc(usuarios.nombre)));

  app.post('/api/usuarios', soloAdmin, async (req, reply) => {
    const d = validar(
      z.object({ email: z.email(), nombre: z.string().trim().min(3).max(120), rol: z.enum(['ADMIN', 'SUPERVISOR']), clave: zClave }),
      req.body,
    );
    const { clave, ...datos } = { ...d, email: d.email.toLowerCase() };
    const creado = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(usuarios)
        .values({ ...datos, hashClave: await hashearClave(clave) })
        .onConflictDoNothing()
        .returning(columnas);
      if (!u) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
      await auditar(tx, { tabla: 'usuarios', registroId: u.id, usuarioId: req.user.id, motivo: 'Alta de usuario', antes: null, despues: u });
      return u;
    });
    return reply.code(201).send(creado);
  });

  app.patch('/api/usuarios/:id', soloAdmin, async (req) => {
    const { id } = validar(zId, req.params);
    const d = validar(
      z.object({ rol: z.enum(['ADMIN', 'SUPERVISOR']).optional(), activo: z.boolean().optional(), clave: zClave.optional(), motivo: zMotivo }),
      req.body,
    );
    if (id === req.user.id && (d.activo === false || d.rol === 'SUPERVISOR')) {
      throw new ErrorHttp(422, 'No puedes desactivarte ni quitarte el rol de administrador');
    }
    return db.transaction(async (tx) => {
      const [antes] = await tx.select(columnas).from(usuarios).where(eq(usuarios.id, id)).for('update');
      if (!antes) throw new ErrorHttp(404, 'Usuario no encontrado');
      const { clave, motivo, ...cambios } = d;
      const [despues] = await tx
        .update(usuarios)
        .set({ ...cambios, ...(clave ? { hashClave: await hashearClave(clave) } : {}) })
        .where(eq(usuarios.id, id))
        .returning(columnas);
      // La clave nunca se guarda en auditoría; solo que cambió.
      await auditar(tx, { tabla: 'usuarios', registroId: id, usuarioId: req.user.id, motivo, antes, despues: { ...despues, ...(clave ? { claveCambiada: true } : {}) } });
      return despues;
    });
  });
}
