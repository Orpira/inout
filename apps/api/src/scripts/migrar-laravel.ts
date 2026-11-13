/**
 * Migra los datos de la base PostgreSQL de la versión Laravel a INOUT 2.
 *
 * ZONA HORARIA DE ORIGEN
 * Laravel guardaba `registros_horarios.entrada/salida` como `timestamp` SIN zona, en la zona de
 * `config('app.timezone')`:
 *   - hasta el despliegue del commit 372b7dd (6-abr-2026): APP_TIMEZONE del .env de producción
 *     (por defecto UTC);
 *   - desde ese despliegue: 'Europe/Madrid' (fijo en config/app.php).
 * Nunca se usó la hora de Colombia de forma explícita. Por eso la zona se indica por periodos con
 * nombres IANA (respetan el horario de verano de Madrid) y hay un modo de análisis para elegirla.
 *
 * USO (DATABASE_URL = base INOUT 2 destino, vacía)
 *   1. Analizar a qué hora de Colombia caerían las entradas con cada zona posible:
 *        npm run migrar:laravel -- --origen postgres://…/laravel --analizar
 *   2. Simular (no escribe nada) con las zonas elegidas:
 *        npm run migrar:laravel -- --origen … --tz UTC --tz-desde 2026-04-06=Europe/Madrid
 *   3. Migrar de verdad:
 *        npm run migrar:laravel -- --origen … --tz UTC --tz-desde 2026-04-06=Europe/Madrid --ejecutar
 *   Opcional: --admins=a@x.co,b@y.co (por defecto, ADMIN el usuario con menor id; el resto SUPERVISOR).
 *
 * REGLAS
 *   - Usuarios: se conservan las contraseñas (bcrypt de Laravel compatible).
 *   - Empleados: se conservan id e identificación. Sin horario asignado (jornada legal L-S):
 *     asígnalo después en el panel.
 *   - Registros:
 *       editado por un usuario en Laravel ("Cambios realizados") y coherente → CERRADA
 *       salida inventada por el cierre automático (18:00)                    → REVISION, sin salida
 *       entrada inventada por Laravel (salida − 1 h)                          → REVISION, con salida
 *       salida anterior a la entrada o turno de más de 24 h                    → REVISION
 *       sin salida: el último del empleado, si es reciente, queda ABIERTA; el resto REVISION
 *   - Cada marcación migrada guarda en auditoría el registro original y las horas tal cual estaban.
 *   - Al final se liquidan todas las marcaciones cerradas con las reglas vigentes en su fecha.
 */
import { fechaLocal } from "@inout/core";
import { count, sql } from "drizzle-orm";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { crearDb } from "../db/client.js";
import { migrar } from "../db/migrate.js";
import { auditoria, empleados, marcaciones, usuarios } from "../db/schema.js";
import { ServicioCalendario } from "../servicios/calendario.js";
import { ServicioMarcaciones } from "../servicios/marcaciones.js";

const { values: args } = parseArgs({
  options: {
    origen: { type: "string" },
    tz: { type: "string" },
    "tz-desde": { type: "string", multiple: true, default: [] },
    admins: { type: "string" },
    analizar: { type: "boolean", default: false },
    ejecutar: { type: "boolean", default: false },
  },
});

function salir(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const urlOrigen = args.origen ?? process.env.LARAVEL_DATABASE_URL;
if (!urlOrigen) salir("Falta --origen <url de la base de Laravel> (o LARAVEL_DATABASE_URL).");
const origen = postgres(urlOrigen, { max: 2, onnotice: () => {}, connection: { TimeZone: "UTC" } });

const MAX_HORAS_TURNO = Number(process.env.MAX_HORAS_TURNO ?? 16);
const CAMBIO_ZONA = "2026-04-06";

async function validarZona(zona: string) {
  const r = await origen`select 1 from pg_timezone_names where name = ${zona}`;
  if (!r.length) salir(`Zona horaria desconocida: ${zona} (usa nombres IANA, p. ej. UTC, Europe/Madrid).`);
}

/* ---------------------------------------------------------------- Análisis */

const CANDIDATAS = ["UTC", "Europe/Madrid", "America/Bogota"];

async function analizar() {
  const [resumen] = await origen`
    select count(*)::int as total, min(entrada)::text as primera, max(entrada)::text as ultima,
           count(*) filter (where entrada < ${CAMBIO_ZONA}::timestamp)::int as antes_abr26,
           count(*) filter (where entrada >= ${CAMBIO_ZONA}::timestamp)::int as desde_abr26
    from registros_horarios`;
  console.log("registros_horarios:", resumen);
  const [viejos] = await origen`select count(*)::int as n from information_schema.tables where table_name = 'registros'`;
  if (viejos?.n) {
    const [n] = await origen`select count(*)::int as n from registros`;
    console.log(`Tabla antigua "registros": ${n?.n} filas (no se migra; revisa si tiene datos que no estén en registros_horarios).`);
  }

  for (const [titulo, antes] of [
    [`ANTES del ${CAMBIO_ZONA}`, true],
    [`DESDE el ${CAMBIO_ZONA}`, false],
  ] as const) {
    const filas = await origen`
      select h,
        ${origen.unsafe(
          CANDIDATAS.map(
            (z) =>
              `count(*) filter (where extract(hour from (entrada at time zone '${z}') at time zone 'America/Bogota') = h)::int as "${z}"`,
          ).join(", "),
        )}
      from generate_series(0, 23) h
      cross join (select entrada from registros_horarios
                  where ${antes ? origen`entrada < ${CAMBIO_ZONA}::timestamp` : origen`entrada >= ${CAMBIO_ZONA}::timestamp`}) r
      group by h order by h`;
    const total = filas.reduce((s, f) => s + Number(f.UTC), 0);
    console.log(`\nEntradas ${titulo} (${total}): hora de Colombia resultante según la zona de origen supuesta`);
    console.log("hora Col. | " + CANDIDATAS.map((z) => z.padStart(14)).join(" | "));
    for (const f of filas) {
      if (!CANDIDATAS.some((z) => Number(f[z]) > 0)) continue;
      console.log(`  ${String(f.h).padStart(2, "0")}:00   | ` + CANDIDATAS.map((z) => String(f[z] || "").padStart(14)).join(" | "));
    }
  }
  console.log("\nLa zona correcta es la columna cuyo pico coincide con la hora real de llegada del personal en Colombia.");
}

/* --------------------------------------------------------------- Migración */

interface Tramo {
  desde: string;
  zona: string;
}

function tramosDeZona(): Tramo[] {
  if (!args.tz) salir("Falta --tz <zona de origen> (p. ej. UTC). Ejecuta antes --analizar.");
  const tramos: Tramo[] = [{ desde: "0001-01-01", zona: args.tz }];
  for (const t of args["tz-desde"] ?? []) {
    const m = /^(\d{4}-\d{2}-\d{2})=(.+)$/.exec(t);
    if (!m) salir(`--tz-desde inválido: ${t} (formato YYYY-MM-DD=Zona)`);
    tramos.push({ desde: m[1]!, zona: m[2]! });
  }
  return tramos.sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Expresión SQL que convierte una columna `timestamp` sin zona a `timestamptz` según el tramo. */
function conversion(col: string, tramos: Tramo[]): string {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const casos = [...tramos]
    .reverse()
    .map((t) => `when ${col} >= ${lit(t.desde)}::timestamp then ${col} at time zone ${lit(t.zona)}`)
    .join(" ");
  return `case ${casos} end`;
}

// Marcas que Laravel dejaba en `novedad`.
const SALIDA_INVENTADA = /salida asignada autom/i;
const ENTRADA_INVENTADA = /entrada nula|entrada asignada autom/i;
const EDITADO_POR_USUARIO = /cambios realizados/i;

type Estado = "ABIERTA" | "CERRADA" | "REVISION";

async function migrarDatos(ejecutar: boolean) {
  const destinoUrl = process.env.DATABASE_URL;
  if (!destinoUrl) salir("Define DATABASE_URL (base INOUT 2 destino).");
  const tramos = tramosDeZona();
  for (const t of tramos) await validarZona(t.zona);
  console.log("Zonas de origen:", tramos.map((t) => `${t.desde} → ${t.zona}`).join(", "));

  const regs = await origen.unsafe(
    `select r.id, r.empleado_id, ${conversion("r.entrada", tramos)} as entrada,
            ${conversion("r.salida", tramos)} as salida,
            r.entrada::text as entrada_orig, r.salida::text as salida_orig, r.estado, r.novedad
     from registros_horarios r where r.entrada is not null order by r.entrada`,
  );
  const emps = await origen`select * from empleados order by id`;
  const users = await origen`select id, name, email, password from users order by id`;

  // Clasificación (igual en simulación y en ejecución)
  const ahora = Date.now();
  const ultimoAbierto = new Map<number, number>();
  for (const r of regs) if (!r.salida) ultimoAbierto.set(r.empleado_id, r.id);
  const idsEmpleados = new Set(emps.map((e) => Number(e.id)));
  const cuenta = { CERRADA: 0, ABIERTA: 0, REVISION: 0, salidasInventadas: 0, entradasInventadas: 0, sinEmpleado: 0 };
  const avisos: string[] = [];

  const plan = regs.flatMap((r) => {
    if (!idsEmpleados.has(Number(r.empleado_id))) {
      cuenta.sinEmpleado++;
      avisos.push(`Registro ${r.id}: el empleado ${r.empleado_id} no existe; se omite.`);
      return [];
    }
    const novedad = String(r.novedad ?? "");
    const entrada = r.entrada as Date;
    let salida = (r.salida as Date | null) ?? null;
    let estado: Estado;
    const notas = [`Migrado de Laravel (registro #${r.id}, estado "${r.estado}"; original ${r.entrada_orig} → ${r.salida_orig ?? "sin salida"}).`];

    if (EDITADO_POR_USUARIO.test(novedad) && salida && salida > entrada) {
      estado = "CERRADA";
      notas.push("Editado por un usuario en Laravel: se respetan sus valores.");
    } else if (SALIDA_INVENTADA.test(novedad) || /autom/i.test(String(r.estado ?? ""))) {
      salida = null;
      estado = "REVISION";
      cuenta.salidasInventadas++;
      notas.push("Salida inventada por el cierre automático de Laravel: descartada.");
    } else if (ENTRADA_INVENTADA.test(novedad)) {
      estado = "REVISION";
      cuenta.entradasInventadas++;
      notas.push("Entrada inventada por Laravel (1 h antes de la salida): confirma la hora real.");
    } else if (salida) {
      estado = salida > entrada ? "CERRADA" : "REVISION";
      if (estado === "REVISION") {
        notas.push("Salida anterior a la entrada: descartada.");
        salida = null;
      }
    } else {
      const reciente = ahora - entrada.getTime() <= MAX_HORAS_TURNO * 3_600_000;
      estado = reciente && ultimoAbierto.get(r.empleado_id) === r.id ? "ABIERTA" : "REVISION";
    }
    if (salida && salida.getTime() - entrada.getTime() > 24 * 3_600_000 && estado === "CERRADA") {
      estado = "REVISION";
      notas.push("Turno de más de 24 h.");
    }
    cuenta[estado]++;
    if (novedad && !EDITADO_POR_USUARIO.test(novedad)) notas.unshift(novedad);
    return [{ r, empleadoId: Number(r.empleado_id), entrada, salida, estado, observacion: notas.join("\n") }];
  });

  console.log(`\nUsuarios: ${users.length} | Empleados: ${emps.length} | Registros: ${regs.length}`);
  console.log(
    `Marcaciones: ${cuenta.CERRADA} cerradas, ${cuenta.ABIERTA} abiertas, ${cuenta.REVISION} por revisar ` +
      `(${cuenta.salidasInventadas} con salida inventada, ${cuenta.entradasInventadas} con entrada inventada), ${cuenta.sinEmpleado} omitidas.`,
  );
  console.log("\nMuestra (hora de Colombia resultante):");
  for (const p of plan.slice(-5)) {
    console.log(`  #${p.r.id} ${p.r.entrada_orig} → ${fechaLocal(p.entrada)} ${p.entrada.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} (${p.estado})`);
  }
  for (const a of avisos.slice(0, 20)) console.log(`  aviso: ${a}`);

  if (!ejecutar) {
    console.log("\nSimulación: no se escribió nada. Si las horas de Colombia son correctas, repite con --ejecutar.");
    return;
  }

  await migrar(destinoUrl);
  const { db, cliente } = crearDb(destinoUrl);
  try {
    const [{ n: nm } = { n: 0 }] = await db.select({ n: count() }).from(marcaciones);
    const [{ n: ne } = { n: 0 }] = await db.select({ n: count() }).from(empleados);
    if (nm + ne > 0) salir("El destino ya tiene empleados o marcaciones. La migración solo se hace sobre una base vacía.");

    const admins = args.admins?.split(",").map((e) => e.trim().toLowerCase());
    const minId = users[0]?.id;
    await db.transaction(async (tx) => {
      for (const u of users) {
        const esAdmin = admins ? admins.includes(String(u.email).toLowerCase()) : u.id === minId;
        await tx
          .insert(usuarios)
          .values({ nombre: u.name, email: u.email, passwordHash: u.password, rol: esAdmin ? "ADMIN" : "SUPERVISOR" })
          .onConflictDoNothing();
      }
      for (const e of emps) {
        await tx.insert(empleados).values({
          id: e.id,
          identificacion: String(e.identificacion ?? `L${e.id}`).trim(),
          nombre: e.nombre ?? "Sin nombre",
          apellido: e.apellido ?? "",
          cargo: e.cargo ?? null,
          email: e.email ?? null,
          telefono: e.telefono ?? null,
          salario: Number(e.salario ?? 0),
          activo: !/inactiv|retirad/i.test(String(e.estado ?? "")),
        });
        if (!Number(e.salario)) avisos.push(`Empleado ${e.id} (${e.nombre}) sin salario: corrígelo antes de liquidar.`);
      }
      await tx.execute(sql`select setval(pg_get_serial_sequence('empleados','id'), coalesce((select max(id) from empleados),1))`);

      for (const p of plan) {
        const [m] = await tx
          .insert(marcaciones)
          .values({ empleadoId: p.empleadoId, entrada: p.entrada, salida: p.salida, estado: p.estado, origen: "MIGRACION", observacion: p.observacion })
          .returning({ id: marcaciones.id });
        await tx.insert(auditoria).values({
          entidad: "marcacion",
          entidadId: m!.id,
          accion: "MIGRAR",
          motivo: `Registro #${p.r.id} de Laravel`,
          antes: { entrada: p.r.entrada_orig, salida: p.r.salida_orig, estado: p.r.estado, novedad: p.r.novedad },
          despues: { entrada: p.entrada.toISOString(), salida: p.salida?.toISOString() ?? null, estado: p.estado },
        });
      }
    });

    const svc = new ServicioMarcaciones(db, new ServicioCalendario(), { MAX_HORAS_TURNO, ANTIREBOTE_SEGUNDOS: 60, MAX_HORAS_OFFLINE: 168 });
    const { recalculados: dias } = await svc.recalcularRango("2000-01-01", "2100-12-31");
    console.log(`\n✔ Migración completada. Días-empleado liquidados: ${dias}.`);
    if (!admins) console.log("  ADMIN: el usuario con menor id; el resto quedó como SUPERVISOR.");
    console.log("  Siguiente paso: asigna un horario a cada empleado y recalcula desde Festivos y normas.");
  } finally {
    await cliente.end();
  }
}

try {
  if (args.analizar) await analizar();
  else await migrarDatos(args.ejecutar ?? false);
} finally {
  await origen.end();
}
