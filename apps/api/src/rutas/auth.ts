import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { usuarios } from "../db/schema.js";
import { ErrorHttp } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";

export const COOKIE_SESION = "inout_sesion";
const DURACION_SEG = 12 * 60 * 60;

/** Laravel guarda hashes bcrypt con prefijo $2y$, equivalente a $2b$. */
export const compararPassword = (plano: string, hash: string) =>
  bcrypt.compare(plano, hash.replace(/^\$2y\$/, "$2b$"));
export const hashPassword = (plano: string) => bcrypt.hash(plano, 12);

export const rutasAuth: Rutas = (app, { db, env }) => {
  const r = zapp(app);
  const secure = env.COOKIE_SECURE ?? env.NODE_ENV === "production";

  r.post(
    "/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: z.object({ email: z.string().email(), password: z.string().min(1) }) },
    },
    async (req, reply) => {
      const [u] = await db
        .select()
        .from(usuarios)
        .where(sql`lower(${usuarios.email}) = ${req.body.email.toLowerCase()}`);
      if (!u || !u.activo || !(await compararPassword(req.body.password, u.passwordHash))) {
        throw new ErrorHttp(401, "Correo o contraseña incorrectos", "CREDENCIALES");
      }
      await db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, u.id));
      const sesion = { id: u.id, nombre: u.nombre, rol: u.rol };
      const token = await reply.jwtSign(sesion, { expiresIn: DURACION_SEG });
      reply.setCookie(COOKIE_SESION, token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: DURACION_SEG,
      });
      return { usuario: { ...sesion, email: u.email } };
    },
  );

  r.post("/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_SESION, { path: "/" });
    return { ok: true };
  });

  r.get("/me", { onRequest: requiereSesion() }, async (req) => {
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.user.id));
    if (!u || !u.activo) throw new ErrorHttp(401, "Sesión no válida", "NO_AUTENTICADO");
    return { usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } };
  });

  r.post(
    "/password",
    {
      onRequest: requiereSesion(),
      schema: { body: z.object({ actual: z.string().min(1), nueva: z.string().min(8, "Mínimo 8 caracteres") }) },
    },
    async (req) => {
      const [u] = await db.select().from(usuarios).where(eq(usuarios.id, req.user.id));
      if (!u || !(await compararPassword(req.body.actual, u.passwordHash))) {
        throw new ErrorHttp(400, "La contraseña actual no es correcta");
      }
      await db.update(usuarios).set({ passwordHash: await hashPassword(req.body.nueva) }).where(eq(usuarios.id, u.id));
      return { ok: true };
    },
  );
};
