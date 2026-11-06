import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { usuarios } from "../db/schema.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { hashPassword } from "./auth.js";

const publico = {
  id: usuarios.id,
  nombre: usuarios.nombre,
  email: usuarios.email,
  rol: usuarios.rol,
  activo: usuarios.activo,
  ultimoAcceso: usuarios.ultimoAcceso,
  creadoEn: usuarios.creadoEn,
};

const base = z.object({
  nombre: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  rol: z.enum(["ADMIN", "SUPERVISOR"]),
  activo: z.boolean().default(true),
});

export const rutasUsuarios: Rutas = (app, { db }) => {
  const r = zapp(app);
  const admin = requiereSesion("ADMIN");

  r.get("/", { onRequest: admin }, async () => ({
    datos: await db.select(publico).from(usuarios).orderBy(asc(usuarios.nombre)),
  }));

  r.post(
    "/",
    { onRequest: admin, schema: { body: base.extend({ password: z.string().min(8, "Mínimo 8 caracteres") }) } },
    async (req, reply) => {
      await emailLibre(req.body.email);
      const { password, ...resto } = req.body;
      const [u] = await db
        .insert(usuarios)
        .values({ ...resto, passwordHash: await hashPassword(password) })
        .returning(publico);
      reply.code(201);
      return u;
    },
  );

  r.put(
    "/:id",
    {
      onRequest: admin,
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: base.extend({ password: z.string().min(8).optional().or(z.literal("")) }),
      },
    },
    async (req) => {
      if (req.params.id === req.user.id && (!req.body.activo || req.body.rol !== "ADMIN")) {
        throw solicitudInvalida("No puedes desactivarte ni quitarte el rol de administrador.");
      }
      await emailLibre(req.body.email, req.params.id);
      const { password, ...resto } = req.body;
      const [u] = await db
        .update(usuarios)
        .set({ ...resto, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
        .where(eq(usuarios.id, req.params.id))
        .returning(publico);
      if (!u) throw noEncontrado("Usuario");
      return u;
    },
  );

  async function emailLibre(email: string, excluirId?: number) {
    const [otro] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`);
    if (otro && otro.id !== excluirId) throw conflicto("Ya existe un usuario con ese correo.", "DUPLICADO");
  }
};
