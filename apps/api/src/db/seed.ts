/**
 * Crea el usuario administrador inicial (y, opcionalmente, datos de demostración).
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
 *   npm run db:seed -- --demo
 */
import { desdeLocal, diaSemana, fechaLocal, minutosHorarioFijo, sumarDias } from "@inout/core";
import { sql } from "drizzle-orm";
import { hashPassword } from "../rutas/auth.js";
import { ServicioCalendario } from "../servicios/calendario.js";
import { ServicioMarcaciones } from "../servicios/marcaciones.js";
import { crearDb } from "./client.js";
import { empleados, horarios, marcaciones, usuarios } from "./schema.js";

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
  const almuerzo = { tipo: "VENTANA" as const, inicio: "12:00", fin: "13:00" };
  const fijo = (laborable: boolean) =>
    laborable ? { laborable, inicio: "08:00", fin: "17:00", minutos: minutosHorarioFijo("08:00", "17:00", almuerzo) } : { laborable, minutos: 0 };
  const [administrativo, bodega] = await db
    .insert(horarios)
    .values([
      {
        nombre: "Administrativo L-V 08:00 a 17:00",
        tipo: "FIJO",
        dias: [0, 1, 2, 3, 4, 5, 6].map((d) => fijo(d >= 1 && d <= 5)),
        descanso: almuerzo,
        toleranciaMinutos: 15,
        requiereAprobacion: true,
      },
      {
        nombre: "Bodega L-S turnos de 7 h",
        tipo: "TURNOS",
        dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ laborable: d !== 0, minutos: d === 0 ? 0 : 420 })),
        descanso: { tipo: "DURACION", minutos: 30, despuesDe: 240 },
        toleranciaMinutos: 0,
        requiereAprobacion: false,
      },
    ])
    .returning();

  const demo = [
    { identificacion: "1001", nombre: "Laura", apellido: "Gómez", cargo: "Auxiliar de bodega", salario: 1_750_905, horarioId: bodega!.id },
    { identificacion: "1002", nombre: "Andrés", apellido: "Ramírez", cargo: "Montacarguista", salario: 2_100_000, horarioId: bodega!.id },
    { identificacion: "1003", nombre: "Paola", apellido: "Castro", cargo: "Supervisora de bodega", salario: 3_200_000, horarioId: bodega!.id },
    { identificacion: "1004", nombre: "Jhon", apellido: "Restrepo", cargo: "Analista de facturación", salario: 2_400_000, horarioId: administrativo!.id },
    { identificacion: "1005", nombre: "Diana", apellido: "Moreno", cargo: "Coordinadora administrativa", salario: 2_800_000, horarioId: administrativo!.id },
  ];
  const insertados = await db.insert(empleados).values(demo).onConflictDoNothing().returning();
  if (insertados.length) {
    const svc = new ServicioMarcaciones(db, new ServicioCalendario(), { MAX_HORAS_TURNO: 16, ANTIREBOTE_SEGUNDOS: 60, MAX_HORAS_OFFLINE: 168 });
    const hoy = fechaLocal(new Date());
    // Turnos rotativos de bodega (06-13:30, 13:30-21, 21-04:30) y horario fijo administrativo.
    const turnosBodega: Array<[string, string, number]> = [
      ["06:00", "13:30", 0],
      ["13:30", "21:00", 0],
      ["21:00", "04:30", 1],
    ];
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
    for (let d = 13; d >= 1; d--) {
      const fecha = sumarDias(hoy, -d);
      const ds = diaSemana(fecha);
      for (const [i, e] of insertados.entries()) {
        const esAdmin = e.horarioId === administrativo!.id;
        if (ds === 0 || (esAdmin && ds === 6 && azar() > 0.2) || azar() < 0.08) continue;
        const [ini, fin, cruza] = esAdmin
          ? (["08:00", "17:00", 0] as [string, string, number])
          : turnosBodega[(i + Math.floor(d / 6)) % turnosBodega.length]!;
        // Bodega: picos de despacho alargan el turno. Administrativo: a veces sale tarde.
        const extra = azar() < (esAdmin ? 0.3 : 0.4) ? Math.floor(azar() * (esAdmin ? 90 : 180)) : 0;
        const entrada = new Date(desdeLocal(fecha, ini).getTime() + Math.floor(azar() * 12 - 6) * 60_000);
        const salida = new Date(desdeLocal(sumarDias(fecha, cruza), fin).getTime() + extra * 60_000);
        await db.insert(marcaciones).values({ empleadoId: e.id, entrada, salida, estado: "CERRADA", origen: "KIOSKO" });
      }
    }
    // Personal en turno ahora mismo
    for (const e of [insertados[0]!, insertados[1]!, insertados[4]!]) {
      await db.insert(marcaciones).values({ empleadoId: e.id, entrada: new Date(Date.now() - 3 * 3_600_000), estado: "ABIERTA" });
    }
    const n = await svc.recalcularRango(sumarDias(hoy, -14), hoy);
    console.log(`✔ Datos de demostración: ${insertados.length} empleados, 2 horarios, ${n} días liquidados`);
  }
}

await cliente.end();
