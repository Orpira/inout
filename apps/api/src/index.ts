import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { crearApp } from './app.js';
import { config } from './config.js';
import { db, pool } from './db/index.js';
import { revisarVencidas } from './marcaciones.js';

await migrate(db, { migrationsFolder: config.MIGRATIONS_DIR });
const app = await crearApp(db);

const MS_TAREA = 10 * 60_000;
const tarea = setInterval(() => {
  revisarVencidas(db)
    .then((n) => n && app.log.info({ n }, 'Turnos sin salida enviados a revisión'))
    .catch((err) => app.log.error(err, 'Error revisando turnos vencidos'));
}, MS_TAREA);

const cerrar = async () => {
  clearInterval(tarea);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
