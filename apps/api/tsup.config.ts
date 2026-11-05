import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/crear-admin.ts', 'src/scripts/migrar-laravel.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // @inout/core se publica como fuente TS: se incluye en el bundle.
  noExternal: ['@inout/core'],
});
