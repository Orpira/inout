import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { empresa, sucursales } from "../db/schema.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errores.js";
import { requiereSesion, zapp, type Rutas } from "../contexto.js";
import { auditar, diferencias, motivoObligatorio } from "../servicios/auditoria.js";

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null));

const esquemaEmpresa = z.object({
  nombre: z.string().trim().min(2, "Escribe la razón social").max(200),
  nit: textoOpcional,
});

const baseSucursal = z.object({
    codigo: z.string().trim().min(1, "Indica el código del centro de costo").max(30),
    nombre: z.string().trim().min(2, "Escribe el nombre de la sucursal").max(100),
    ciudad: textoOpcional,
    direccion: textoOpcional,
    latitud: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
    longitud: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
    radioMetros: z.number().int().min(50, "Mínimo 50 m").max(5000, "Máximo 5000 m").default(300),
    activa: z.boolean().default(true),
});
const coordenadasCompletas = (s: { latitud: number | null; longitud: number | null }) => (s.latitud === null) === (s.longitud === null);
const avisoCoordenadas = { message: "Indica latitud y longitud, o ninguna de las dos", path: ["latitud"] };
const esquemaSucursal = baseSucursal.refine(coordenadasCompletas, avisoCoordenadas);

/** Razón social guardada; si aún no se ha definido, la de la variable de entorno (instalaciones anteriores). */
export async function nombreEmpresa(db: Db, respaldo?: string) {
  const [e] = await db.select({ nombre: empresa.nombre }).from(empresa).where(eq(empresa.id, 1));
  return e?.nombre ?? respaldo ?? "";
}

export const rutasEmpresa: Rutas = (app, { db, env }) => {
  const r = zapp(app);
  const admin = requiereSesion("ADMIN");

  r.get("/", { onRequest: requiereSesion() }, async () => {
    const [e] = await db.select().from(empresa).where(eq(empresa.id, 1));
    return {
      empresa: e ? { nombre: e.nombre, nit: e.nit, definida: true } : { nombre: env.EMPRESA_NOMBRE ?? "", nit: null, definida: false },
      sucursales: await db.select().from(sucursales).orderBy(asc(sucursales.nombre)),
    };
  });

  r.put("/", { onRequest: admin, schema: { body: esquemaEmpresa.extend({ motivo: motivoObligatorio.optional() }) } }, async (req) => {
    const { motivo, ...datos } = req.body;
    return db.transaction(async (tx) => {
      const [antes] = await tx.select().from(empresa).where(eq(empresa.id, 1));
      if (!antes) {
        const [e] = await tx.insert(empresa).values({ id: 1, ...datos }).returning();
        await auditar(tx, { entidad: "empresa", entidadId: 1, usuarioId: req.user.id, accion: "CREAR", motivo: "Datos de la empresa definidos", antes: null, despues: datos });
        return e;
      }
      const dif = diferencias(antes, datos);
      if (!dif.hayCambios) return antes;
      if (!motivo) throw solicitudInvalida("Explica el motivo del cambio.");
      const [e] = await tx.update(empresa).set({ ...datos, actualizadoEn: new Date() }).where(eq(empresa.id, 1)).returning();
      await auditar(tx, { entidad: "empresa", entidadId: 1, usuarioId: req.user.id, accion: "EDITAR", motivo, antes: dif.antes, despues: dif.despues });
      return e;
    });
  });

  r.post("/sucursales", { onRequest: admin, schema: { body: esquemaSucursal } }, async (req, reply) => {
    await libre(req.body);
    const s = await db.transaction(async (tx) => {
      const [s] = await tx.insert(sucursales).values(req.body).returning();
      await auditar(tx, { entidad: "sucursal", entidadId: s!.id, usuarioId: req.user.id, accion: "CREAR", motivo: "Alta de sucursal", antes: null, despues: req.body });
      return s;
    });
    reply.code(201);
    return s;
  });

  r.put(
    "/sucursales/:id",
    {
      onRequest: admin,
      schema: { params: z.object({ id: z.coerce.number().int() }), body: baseSucursal.extend({ motivo: motivoObligatorio }).refine(coordenadasCompletas, avisoCoordenadas) },
    },
    async (req) => {
      const { motivo, ...datos } = req.body;
      await libre(datos, req.params.id);
      return db.transaction(async (tx) => {
        const [antes] = await tx.select().from(sucursales).where(eq(sucursales.id, req.params.id));
        if (!antes) throw noEncontrado("Sucursal");
        const dif = diferencias(antes, datos);
        if (!dif.hayCambios) return antes;
        const [s] = await tx.update(sucursales).set({ ...datos, actualizadoEn: new Date() }).where(eq(sucursales.id, req.params.id)).returning();
        await auditar(tx, { entidad: "sucursal", entidadId: req.params.id, usuarioId: req.user.id, accion: "EDITAR", motivo, antes: dif.antes, despues: dif.despues });
        return s;
      });
    },
  );

  async function libre(s: { codigo: string; nombre: string }, excluirId?: number) {
    const otros = await db
      .select({ id: sucursales.id, codigo: sucursales.codigo, nombre: sucursales.nombre })
      .from(sucursales)
      .where(sql`lower(${sucursales.codigo}) = ${s.codigo.toLowerCase()} or lower(${sucursales.nombre}) = ${s.nombre.toLowerCase()}`);
    const o = otros.find((x) => x.id !== excluirId);
    if (!o) return;
    throw conflicto(
      o.codigo.toLowerCase() === s.codigo.toLowerCase() ? `El código ${s.codigo} ya es de la sucursal ${o.nombre}.` : `Ya existe una sucursal llamada ${o.nombre}.`,
      "DUPLICADO",
    );
  }
};
