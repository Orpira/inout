import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

// `date` (OID 1082) como texto: node-postgres lo convertiría a medianoche en la
// zona del servidor, y desde España eso corre la fecha respecto a Colombia.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  // Sesión en UTC: now() y los literales no dependen de la configuración del servidor.
  options: '-c TimeZone=UTC',
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
