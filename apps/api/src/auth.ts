import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';

const scrypt = promisify(scryptCb) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;

export type Rol = 'ADMIN' | 'SUPERVISOR';
export interface Sesion {
  id: number;
  rol: Rol;
  nombre: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Sesion;
    user: Sesion;
  }
}

export const COOKIE_SESION = 'inout_sesion';

export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(clave, sal, 64);
  return ['scrypt', sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [alg, salB64, hashB64] = guardado.split('$');
  if (alg !== 'scrypt' || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const hash = await scrypt(clave, Buffer.from(salB64, 'base64'), esperado.length);
  return timingSafeEqual(hash, esperado);
}

/** preHandler: exige sesión y, si se indican, uno de los roles. */
export function requiereRol(...roles: Rol[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.code(401).send({ error: 'No autenticado' });
    }
    if (roles.length && !roles.includes(req.user.rol)) {
      return reply.code(403).send({ error: 'Sin permiso' });
    }
  };
}
