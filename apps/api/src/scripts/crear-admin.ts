/**
 * Crea (o reactiva con nueva clave) un usuario ADMIN.
 * Uso: npm run crear-admin -w @inout/api -- <email> <nombre> <clave>
 */
import { hashearClave } from '../auth.js';
import { db, pool } from '../db/index.js';
import { usuarios } from '../db/schema.js';

const [email, nombre, clave] = process.argv.slice(2);
if (!email || !nombre || !clave || clave.length < 10) {
  console.error('Uso: crear-admin <email> <nombre> <clave (mín. 10 caracteres)>');
  process.exit(1);
}

const hashClave = await hashearClave(clave);
await db
  .insert(usuarios)
  .values({ email: email.toLowerCase(), nombre, hashClave, rol: 'ADMIN' })
  .onConflictDoUpdate({ target: usuarios.email, set: { nombre, hashClave, rol: 'ADMIN', activo: true } });
console.log(`Administrador ${email} listo.`);
await pool.end();
