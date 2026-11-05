import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/** Localiza la carpeta de migraciones tanto en desarrollo (src/) como en el build (dist/). */
function carpetaMigraciones() {
  const aqui = dirname(fileURLToPath(import.meta.url));
  for (const c of [resolve(aqui, "../../drizzle"), resolve(aqui, "../drizzle"), resolve(process.cwd(), "drizzle")]) {
    if (existsSync(resolve(c, "meta/_journal.json"))) return c;
  }
  throw new Error("No se encontró la carpeta de migraciones 'drizzle'");
}

export async function migrar(url: string) {
  const cliente = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(cliente), { migrationsFolder: carpetaMigraciones() });
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no definida");
  await migrar(url);
  console.log("✔ Migraciones aplicadas");
}
