import { construirApp } from "./app.js";
import { migrar } from "./db/migrate.js";
import { cargarEnv } from "./env.js";

const env = cargarEnv();
if (process.argv.includes("--migrar")) await migrar(env.DATABASE_URL);

const { app, ctx } = await construirApp(env);

// Tarea periódica: cierra con la hora del horario los turnos sin salida que superan MAX_HORAS_TURNO.
const revisarVencidas = async () => {
  try {
    const r = await ctx.marcaciones.cerrarVencidas();
    if (r.cerradas || r.aRevision) app.log.info(r, "Turnos sin salida cerrados automáticamente o enviados a revisión");
  } catch (e) {
    app.log.error(e, "Error revisando marcaciones vencidas");
  }
};
const intervalo = setInterval(revisarVencidas, 10 * 60_000);
void revisarVencidas();

const cerrar = async () => {
  clearInterval(intervalo);
  await app.close();
  process.exit(0);
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);

await app.listen({ port: env.PORT, host: env.HOST });
