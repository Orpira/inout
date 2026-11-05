/**
 * Crea el usuario administrador inicial (y, opcionalmente, datos de demostración).
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
 *   npm run db:seed -- --demo
 */
import { desdeLocal, fechaLocal, sumarDias } from "@inout/core";
import { sql } from "drizzle-orm";
import { hashPassword } from "../rutas/auth.js";
import { ServicioCalendario } from "../servicios/calendario.js";
import { ServicioMarcaciones } from "../servicios/marcaciones.js";
import { crearDb } from "./client.js";
import { empleados, marcaciones, usuarios } from "./schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no definida");
const { db, cliente } = crearDb(url);

const email = process.env.ADMIN_EMAIL ?? "admin@inout.local";
const password = process.env.ADMIN_PASSWORD ?? "cambiar-esta-clave";

const [existe] = await db.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`);
if (!existe) {
  await db.insert(usuarios).values({ nombre: "Administrador", email, passwordHash: await hashPassword(password), rol: "ADMIN" });
  console.log(`✔ Usuario administrador creado: ${email}`);
} else {
  console.log(`• El usuario ${email} ya existe`);
}

if (process.argv.includes("--demo")) {
  const demo = [
    { identificacion: "1001", nombre: "Laura", apellido: "Gómez", cargo: "Auxiliar de bodega", salario: 1_750_905 },
    { identificacion: "1002", nombre: "Andrés", apellido: "Ramírez", cargo: "Montacarguista", salario: 2_100_000 },
    { identificacion: "1003", nombre: "Paola", apellido: "Castro", cargo: "Supervisora de turno", salario: 3_200_000 },
    { identificacion: "1004", nombre: "Jhon", apellido: "Restrepo", cargo: "Conductor", salario: 2_400_000, minutosJornadaDia: 480 },
    { identificacion: "1005", nombre: "Diana", apellido: "Moreno", cargo: "Analista de inventarios", salario: 2_800_000 },
  ];
  const insertados = await db.insert(empleados).values(demo).onConflictDoNothing().returning();
  if (insertados.length) {
    const svc = new ServicioMarcaciones(db, new ServicioCalendario(), { MAX_HORAS_TURNO: 16, ANTIREBOTE_SEGUNDOS: 60, MAX_HORAS_OFFLINE: 48 });
    const hoy = fechaLocal(new Date());
    const turnos: Array<[string, string, number]> = [
      ["06:00", "14:30", 0],
      ["07:00", "17:00", 0],
      ["14:00", "22:30", 0],
      ["22:00", "06:00", 1],
      ["08:00", "16:00", 0],
    ];
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
    for (let d = 13; d >= 1; d--) {
      const fecha = sumarDias(hoy, -d);
      for (const [i, e] of insertados.entries()) {
        if (azar() < 0.15) continue;
        const [ini, fin, cruza] = turnos[(i + d) % turnos.length]!;
        const extra = azar() < 0.35 ? Math.floor(azar() * 150) : 0;
        const entrada = new Date(desdeLocal(fecha, ini).getTime() + Math.floor(azar() * 10) * 60_000);
        const salida = new Date(desdeLocal(sumarDias(fecha, cruza), fin).getTime() + extra * 60_000);
        await db.insert(marcaciones).values({ empleadoId: e.id, entrada, salida, estado: "CERRADA", origen: "KIOSKO" });
      }
    }
    // Dos personas en turno ahora mismo
    for (const e of insertados.slice(0, 2)) {
      await db.insert(marcaciones).values({ empleadoId: e.id, entrada: new Date(Date.now() - 3 * 3_600_000), estado: "ABIERTA" });
    }
    const n = await svc.recalcularRango(sumarDias(hoy, -14), hoy);
    console.log(`✔ Datos de demostración: ${insertados.length} empleados, ${n} días liquidados`);
  }
}

await cliente.end();
