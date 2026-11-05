/**
 * Migra los datos de la base PostgreSQL de la versión Laravel a INOUT 2.
 *
 *   LARAVEL_DATABASE_URL=postgres://...  DATABASE_URL=postgres://...  npm run migrar:laravel
 *
 * Opciones:
 *   --tz=-05:00      Desplazamiento con el que Laravel guardaba las fechas (timestamp sin zona).
 *                    Por defecto -05:00 (hora de Colombia). Use +00:00 si APP_TIMEZONE era UTC.
 *   --admins=a@x,b@y Correos que se migran con rol ADMIN (por defecto, el usuario con menor id).
 *   --forzar         Permite ejecutar aunque la base destino ya tenga marcaciones.
 *
 * Reglas:
 *   - users → usuarios (los hashes bcrypt de Laravel siguen siendo válidos).
 *   - empleados → empleados (se conservan los id).
 *   - registros_horarios → marcaciones (origen MIGRACION):
 *       con salida               → CERRADA
 *       cierre automático Laravel → REVISION (Laravel inventaba la salida a las 18:00)
 *       sin salida               → ABIERTA la más reciente por empleado, el resto REVISION
 *   - Se recalcula la liquidación de todas las marcaciones cerradas con las reglas vigentes.
 */
import { fechaLocal } from "@inout/core";
import { count, sql } from "drizzle-orm";
import postgres from "postgres";
import { crearDb } from "../db/client.js";
import { migrar } from "../db/migrate.js";
import { empleados, marcaciones, usuarios } from "../db/schema.js";
import { ServicioCalendario } from "../servicios/calendario.js";
import { ServicioMarcaciones } from "../servicios/marcaciones.js";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const origenUrl = process.env.LARAVEL_DATABASE_URL;
const destinoUrl = process.env.DATABASE_URL;
if (!origenUrl || !destinoUrl) throw new Error("Defina LARAVEL_DATABASE_URL y DATABASE_URL");
const tz = arg("tz") ?? "-05:00";
if (!/^[+-]\d{2}:\d{2}$/.test(tz)) throw new Error("--tz debe tener el formato ±HH:MM");
const adminsArg = arg("admins")?.split(",").map((e) => e.trim().toLowerCase());

const origen = postgres(origenUrl, { max: 2, onnotice: () => {} });
await migrar(destinoUrl);
const { db, cliente } = crearDb(destinoUrl);

try {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(marcaciones);
  if (n > 0 && !process.argv.includes("--forzar")) {
    throw new Error(`La base destino ya tiene ${n} marcaciones. Use --forzar si está seguro.`);
  }

  const columnas = async (tabla: string) =>
    new Set(
      (await origen`select column_name from information_schema.columns where table_name = ${tabla}`).map(
        (c) => c.column_name as string,
      ),
    );

  // Usuarios
  const users = await origen`select id, name, email, password from users order by id`;
  const minId = users[0]?.id;
  let nUsuarios = 0;
  for (const u of users) {
    const esAdmin = adminsArg ? adminsArg.includes(String(u.email).toLowerCase()) : u.id === minId;
    const r = await db
      .insert(usuarios)
      .values({ nombre: u.name, email: u.email, passwordHash: u.password, rol: esAdmin ? "ADMIN" : "SUPERVISOR" })
      .onConflictDoNothing()
      .returning({ id: usuarios.id });
    nUsuarios += r.length;
  }

  // Empleados
  const colsEmp = await columnas("empleados");
  const emps = await origen`select * from empleados order by id`;
  for (const e of emps) {
    const activo = colsEmp.has("estado") ? !/inactiv|retirad/i.test(String(e.estado ?? "")) : true;
    await db
      .insert(empleados)
      .values({
        id: e.id,
        identificacion: String(e.identificacion ?? e.id),
        nombre: e.nombre ?? "Sin nombre",
        apellido: e.apellido ?? "",
        cargo: e.cargo ?? null,
        email: e.email ?? null,
        telefono: e.telefono ?? null,
        salario: Number(e.salario ?? 0),
        fechaIngreso: e.fecha_ingreso ? fechaLocal(new Date(e.fecha_ingreso)) : null,
        activo,
      })
      .onConflictDoNothing();
  }
  await db.execute(sql`select setval(pg_get_serial_sequence('empleados','id'), coalesce((select max(id) from empleados),1))`);

  // Registros horarios
  const regs = await origen`
    select id, empleado_id, estado, novedad,
           (entrada::timestamp::text || ${tz})::timestamptz as entrada,
           (salida::timestamp::text  || ${tz})::timestamptz as salida
    from registros_horarios
    where entrada is not null
    order by empleado_id, entrada`;

  const ultimaAbierta = new Map<number, number>();
  for (const r of regs) if (!r.salida) ultimaAbierta.set(r.empleado_id, r.id);

  let nMarc = 0;
  let nRevision = 0;
  for (const r of regs) {
    const novedad: string | null = r.novedad ?? null;
    const autoLaravel = /autom[aá]tic/i.test(novedad ?? "") || /autom[aá]tic/i.test(String(r.estado ?? ""));
    let estado: "ABIERTA" | "CERRADA" | "REVISION";
    if (!r.salida) estado = ultimaAbierta.get(r.empleado_id) === r.id ? "ABIERTA" : "REVISION";
    else if (autoLaravel || r.salida <= r.entrada) estado = "REVISION";
    else estado = "CERRADA";
    if (estado === "REVISION") nRevision++;
    await db.insert(marcaciones).values({
      empleadoId: r.empleado_id,
      entrada: r.entrada,
      // Las salidas inválidas (anteriores a la entrada) se descartan para revisión manual.
      salida: r.salida && r.salida > r.entrada ? r.salida : null,
      estado,
      origen: "MIGRACION",
      observacion: [novedad, `Migrado desde Laravel (registro #${r.id}).`].filter(Boolean).join("\n"),
    });
    nMarc++;
  }

  const svc = new ServicioMarcaciones(db, new ServicioCalendario(), {
    MAX_HORAS_TURNO: 16,
    ANTIREBOTE_SEGUNDOS: 60,
    MAX_HORAS_OFFLINE: 168,
  });
  const dias = await svc.recalcularRango("2000-01-01", "2100-12-31");

  console.log(`✔ Usuarios: ${nUsuarios} | Empleados: ${emps.length} | Marcaciones: ${nMarc} (${nRevision} en revisión) | Días liquidados: ${dias}`);
  if (!adminsArg) console.log("  Rol ADMIN asignado al usuario con menor id; el resto quedó como SUPERVISOR.");
} finally {
  await origen.end();
  await cliente.end();
}
