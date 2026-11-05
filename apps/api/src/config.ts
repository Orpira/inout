import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MAX_HORAS_TURNO: z.coerce.number().positive().default(16),
  ANTIRREBOTE_SEGUNDOS: z.coerce.number().nonnegative().default(60),
  /** Carpeta con el build de apps/web; en producción la API sirve el frontend. */
  WEB_DIST: z.string().optional(),
  /** Migraciones SQL generadas por drizzle-kit; se aplican al arrancar. */
  MIGRATIONS_DIR: z.string().default('./drizzle'),
});

export const config = esquema.parse(process.env);
export type Config = typeof config;
