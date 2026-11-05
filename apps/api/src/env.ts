import { z } from "zod";

const esquema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  /** Orígenes permitidos para CORS (solo necesario si el frontend se sirve desde otro dominio). */
  CORS_ORIGIN: z.string().optional(),
  /** Si se define, el kiosko debe enviar este token en la cabecera x-kiosko-token. */
  KIOSKO_TOKEN: z.string().optional(),
  /** Horas tras las cuales una marcación abierta pasa a revisión. */
  MAX_HORAS_TURNO: z.coerce.number().min(4).max(48).default(16),
  /** Ventana anti-rebote entre marcaciones del mismo empleado (segundos). */
  ANTIREBOTE_SEGUNDOS: z.coerce.number().min(0).default(60),
  /** Horas hacia atrás aceptadas para marcaciones capturadas sin conexión. */
  MAX_HORAS_OFFLINE: z.coerce.number().min(0).default(48),
  /** Ruta al build del frontend para servirlo desde la API (opcional). */
  WEB_DIST: z.string().optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type Env = z.infer<typeof esquema>;

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  const r = esquema.safeParse(fuente);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  return r.data;
}
