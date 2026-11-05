import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { empleados } from "../db/schema.js";
import { conflicto, noEncontrado } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";

const texto = z.string().trim();
const opcional = texto.max(200).nullish().transform((v) => (v ? v : null));

export const esquemaEmpleado = z.object({
  identificacion: texto.min(3, "Mínimo 3 caracteres").max(40).regex(/^[\w-]+$/, "Solo letras, números y guiones"),
  nombre: texto.min(1, "Requerido").max(100),
  apellido: texto.min(1, "Requerido").max(100),
  cargo: opcional,
  email: z.string().trim().email("Correo inválido").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  telefono: opcional,
  salario: z.coerce.number().min(0, "No puede ser negativo").max(1_000_000_000),
  minutosJornadaDia: z.coerce.number().int().min(60).max(720).nullish().transform((v) => v ?? null),
  fechaIngreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  activo: z.boolean().default(true),
});

export const rutasEmpleados: Rutas = (app, { db }) => {
  const r = zapp(app);
  const lectura = requiereSesion();
  const escritura = requiereSesion("ADMIN");

  r.get(
    "/",
    {
      onRequest: lectura,
      schema: {
        querystring: z.object({
          q: z.string().optional(),
          estado: z.enum(["activos", "inactivos", "todos"]).default("activos"),
        }),
      },
    },
    async (req) => {
      const filtros: (SQL | undefined)[] = [];
      if (req.query.estado !== "todos") filtros.push(eq(empleados.activo, req.query.estado === "activos"));
      if (req.query.q) {
        const p = `%${req.query.q.trim()}%`;
        filtros.push(
          or(
            ilike(empleados.nombre, p),
            ilike(empleados.apellido, p),
            ilike(empleados.identificacion, p),
            ilike(empleados.cargo, p),
            ilike(sql`${empleados.nombre} || ' ' || ${empleados.apellido}`, p),
          ),
        );
      }
      const filas = await db
        .select({
          empleado: empleados,
          // Columna cualificada a mano: dentro de la subconsulta un "id" sin tabla se resolvería como m.id.
          enTurno: sql<boolean>`exists(select 1 from marcaciones m where m.empleado_id = "empleados"."id" and m.estado = 'ABIERTA')`,
        })
        .from(empleados)
        .where(and(...filtros))
        .orderBy(asc(empleados.apellido), asc(empleados.nombre));
      return { datos: filas.map((f) => ({ ...f.empleado, enTurno: f.enTurno })) };
    },
  );

  r.get("/:id", { onRequest: lectura, schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req) => {
    const [e] = await db.select().from(empleados).where(eq(empleados.id, req.params.id));
    if (!e) throw noEncontrado("Empleado");
    return e;
  });

  r.post("/", { onRequest: escritura, schema: { body: esquemaEmpleado } }, async (req, reply) => {
    await validarUnico(req.body.identificacion);
    const [e] = await db.insert(empleados).values(req.body).returning();
    reply.code(201);
    return e;
  });

  r.put(
    "/:id",
    { onRequest: escritura, schema: { params: z.object({ id: z.coerce.number().int() }), body: esquemaEmpleado } },
    async (req) => {
      await validarUnico(req.body.identificacion, req.params.id);
      const [e] = await db.update(empleados).set(req.body).where(eq(empleados.id, req.params.id)).returning();
      if (!e) throw noEncontrado("Empleado");
      return e;
    },
  );

  async function validarUnico(identificacion: string, excluirId?: number) {
    const [otro] = await db.select({ id: empleados.id }).from(empleados).where(eq(empleados.identificacion, identificacion));
    if (otro && otro.id !== excluirId) throw conflicto("Ya existe un empleado con esa identificación.", "DUPLICADO");
  }
};
