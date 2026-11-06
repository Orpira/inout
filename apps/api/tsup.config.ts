import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/db/migrate.ts", "src/db/seed.ts", "src/scripts/migrar-laravel.ts"],
  format: "esm",
  target: "node20",
  platform: "node",
  clean: true,
  // El paquete @inout/core se incluye en el bundle; el resto de dependencias se instalan en producción.
  noExternal: ["@inout/core"],
});
