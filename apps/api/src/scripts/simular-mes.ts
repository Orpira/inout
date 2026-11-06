/**
 * Simulación de un mes de operación para demostrar los cálculos de INOUT.
 *
 *   npm run db:simular                 crea ~5 semanas de marcaciones hasta hoy
 *   npm run db:simular -- --limpiar    borra todo lo creado por la simulación
 *
 * Todo pasa por los mismos servicios y endpoints que usa la aplicación (kiosko, sincronización
 * sin conexión, CRUD de horarios, empleados y marcaciones, aprobación de extras), así que cada
 * cambio queda en la auditoría con su usuario, motivo y valores antes/después.
 *
 * Casos que cubre:
 *   - Horas ordinarias diurnas y nocturnas (recargo nocturno desde las 19:00).
 *   - Extras diurnas, nocturnas, dominicales y festivas.
 *   - Festivos de Colombia que caen en el periodo (trabajados y descansados).
 *   - Alerta de más de 2 h extra en el día y de más de 12 h extra en la semana.
 *   - Tolerancia, extras pendientes, aprobadas, aprobadas en parte, rechazadas y en lote.
 *   - Turnos sin salida que pasan a revisión (uno corregido por el supervisor y otro pendiente).
 *   - Registro manual (kiosko caído), corrección de hora de entrada, anulación por error.
 *   - Corrección de horas que anula una aprobación previa.
 *   - Marcaciones sin conexión: reloj de tablet desfasado, duplicado descartado y código inválido.
 *   - Alta y edición de horarios y empleados (cambio de salario y baja de un temporal).
 *
 * Requiere un administrador (ADMIN_EMAIL / ADMIN_PASSWORD, los mismos de `db:seed`).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { desdeLocal, diaSemana, fechaLocal, formatearMinutos, lunesDeSemana, sumarDias } from "@inout/core";
import { and, eq, gte, inArray, like, lt, ne, or, sql } from "drizzle-orm";
import { construirApp } from "../app.js";
import { auditoria, empleados, horarios, marcaciones, marcasOffline, usuarios } from "../db/schema.js";
import { cargarEnv } from "../env.js";

const SUFIJO = " (simulación)";
const EMAIL_SUPERVISOR = process.env.SIM_SUPERVISOR_EMAIL ?? "supervisor.simulacion@inout.local";
const CODIGO_INVALIDO = "2099";
const CODIGOS = ["2001", "2002", "2003", "2004", "2005", "2006", "2007"] as const;
type Codigo = (typeof CODIGOS)[number];

// Las marcaciones del mes se registran con su hora real, que es más antigua que la ventana
// normal del kiosko sin conexión: se amplía solo para esta ejecución.
const env = cargarEnv({ ...process.env, MAX_HORAS_OFFLINE: String(24 * 45) });
const { app, ctx } = await construirApp(env, { logger: false });
const { db } = ctx;

try {
  if (process.argv.includes("--limpiar")) await limpiar();
  else await simular();
} catch (e) {
  console.error(`\n✖ ${(e as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await app.close();
}

// ---------------------------------------------------------------------------------------------
// HTTP contra la propia API (sin abrir puertos)
// ---------------------------------------------------------------------------------------------

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function llamar<T = any>(cookie: string, method: Metodo, url: string, payload?: object): Promise<T> {
  const headers: Record<string, string> = { cookie };
  if (env.KIOSKO_TOKEN) headers["x-kiosko-token"] = env.KIOSKO_TOKEN;
  const r = await app.inject({ method, url, payload, headers });
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode}: ${r.body}`);
  return r.json() as T;
}

async function login(email: string, password: string) {
  const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (r.statusCode !== 200) return null;
  return String(r.headers["set-cookie"] ?? "").split(";")[0]!;
}

/** Comprueba la conexión, las migraciones y el administrador, con un mensaje claro para cada fallo. */
async function verificarAdmin(email: string, password: string) {
  const destino = env.DATABASE_URL.replace(/\/\/[^@/]*@/, "//***@");
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    const causa: { code?: string; message?: string } = (e as { cause?: { code?: string; message?: string } }).cause ?? (e as Error);
    throw new Error(
      `No se pudo conectar a PostgreSQL (${destino}): ${causa.code ?? causa.message}.\n` +
        "  Arranca la base o corrige DATABASE_URL en el .env de la raíz del repo.",
    );
  }
  const [tabla] = await db.execute<{ existe: boolean }>(sql`select to_regclass('public.usuarios') is not null as existe`);
  if (!tabla?.existe) throw new Error(`La base ${destino} no tiene las tablas de INOUT. Ejecuta antes "npm run db:migrate".`);

  const [u] = await db.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`);
  if (!u) {
    const admins = await db.select({ email: usuarios.email }).from(usuarios).where(and(eq(usuarios.rol, "ADMIN"), eq(usuarios.activo, true)));
    throw new Error(
      `No existe el usuario ${email} en ${destino}.\n` +
        (admins.length
          ? `  Administradores disponibles: ${admins.map((a) => a.email).join(", ")}. Usa ADMIN_EMAIL y ADMIN_PASSWORD.`
          : '  Crea el administrador con "npm run db:seed".'),
    );
  }
  if (u.rol !== "ADMIN" || !u.activo) throw new Error(`${email} debe ser un usuario ADMIN activo.`);
  const cookie = await login(email, password);
  if (!cookie) throw new Error(`La clave de ${email} no es correcta. Pásala con ADMIN_PASSWORD='...' npm run db:simular`);
  return cookie;
}

// ---------------------------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------------------------

async function simular() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@inout.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "cambiar-esta-clave";
  const admin = await verificarAdmin(adminEmail, adminPassword);

  const ya = await db.select({ id: empleados.id }).from(empleados).where(inArray(empleados.identificacion, [...CODIGOS]));
  if (ya.length) throw new Error('La simulación ya existe. Bórrala con "npm run db:simular -- --limpiar" para repetirla.');

  // --- Usuario supervisor -------------------------------------------------------------------
  const passSupervisor = process.env.SIM_SUPERVISOR_PASSWORD ?? randomBytes(9).toString("base64url");
  const [supExiste] = await db.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${EMAIL_SUPERVISOR.toLowerCase()}`);
  if (supExiste) {
    await llamar(admin, "PUT", `/api/usuarios/${supExiste.id}`, {
      nombre: supExiste.nombre, email: supExiste.email, rol: "SUPERVISOR", activo: true, password: passSupervisor,
    });
  } else {
    await llamar(admin, "POST", "/api/usuarios", { nombre: "Marta Supervisora", email: EMAIL_SUPERVISOR, rol: "SUPERVISOR", password: passSupervisor });
  }
  const sup = (await login(EMAIL_SUPERVISOR, passSupervisor))!;

  // --- Horarios (alta + una edición con motivo) ---------------------------------------------
  const almuerzo = { tipo: "VENTANA" as const, inicio: "12:00", fin: "13:00" };
  const pausa = { tipo: "DURACION" as const, minutos: 30, despuesDe: 240 };
  const semana = (laborable: (ds: number) => boolean, dia: (ds: number) => object) =>
    [0, 1, 2, 3, 4, 5, 6].map((ds) => (laborable(ds) ? { laborable: true, ...dia(ds) } : { laborable: false, minutos: 0 }));

  const hAdmin = await llamar(admin, "POST", "/api/horarios", {
    nombre: `Administrativo L-V 08:00 a 17:00${SUFIJO}`,
    tipo: "FIJO",
    dias: semana((ds) => ds >= 1 && ds <= 5, () => ({ inicio: "08:00", fin: "17:00" })),
    descanso: almuerzo,
    toleranciaMinutos: 10,
    requiereAprobacion: true,
  });
  await llamar(admin, "PUT", `/api/horarios/${hAdmin.id}`, {
    nombre: hAdmin.nombre, tipo: hAdmin.tipo, dias: hAdmin.dias, descanso: hAdmin.descanso,
    toleranciaMinutos: 15, requiereAprobacion: true, activo: true,
    motivo: "Nómina acordó 15 minutos de tolerancia a la salida (acta de comité de octubre).",
  });
  const hBodega = await llamar(admin, "POST", "/api/horarios", {
    nombre: `Bodega L-S turnos de 7 h${SUFIJO}`,
    tipo: "TURNOS",
    dias: semana((ds) => ds !== 0, () => ({ minutos: 420 })),
    descanso: pausa,
    toleranciaMinutos: 0,
    requiereAprobacion: false,
  });
  const hNoche = await llamar(admin, "POST", "/api/horarios", {
    nombre: `Bodega nocturno D-V 22:00 a 05:30${SUFIJO}`,
    tipo: "TURNOS",
    dias: semana((ds) => ds !== 6, () => ({ minutos: 420 })),
    descanso: pausa,
    toleranciaMinutos: 0,
    requiereAprobacion: false,
  });

  // --- Empleados ----------------------------------------------------------------------------
  const hoy = fechaLocal(new Date());
  const inicio = lunesDeSemana(sumarDias(hoy, -28));
  const datosEmpleados: Record<Codigo, object> = {
    "2001": { nombre: "Laura", apellido: "Gómez", cargo: "Auxiliar de bodega (turno rotativo)", salario: 1_750_905, horarioId: hBodega.id },
    "2002": { nombre: "Andrés", apellido: "Ramírez", cargo: "Montacarguista (turno tarde)", salario: 2_100_000, horarioId: hBodega.id },
    "2003": { nombre: "Paola", apellido: "Castro", cargo: "Supervisora de bodega (turno noche)", salario: 3_200_000, horarioId: hNoche.id },
    "2004": { nombre: "Jhon", apellido: "Restrepo", cargo: "Analista de facturación", salario: 2_400_000, horarioId: hAdmin.id },
    "2005": { nombre: "Diana", apellido: "Moreno", cargo: "Coordinadora administrativa", salario: 2_800_000, horarioId: hAdmin.id },
    "2006": { nombre: "Carlos", apellido: "Pérez", cargo: "Conductor de reparto", salario: 1_900_000, horarioId: null },
    "2007": { nombre: "Sofía", apellido: "Herrera", cargo: "Auxiliar temporal de bodega", salario: 1_750_905, horarioId: hBodega.id },
  };
  const emp = {} as Record<Codigo, { id: number } & Record<string, unknown>>;
  for (const c of CODIGOS) {
    emp[c] = await llamar(admin, "POST", "/api/empleados", { identificacion: c, fechaIngreso: sumarDias(inicio, -60), ...datosEmpleados[c] });
  }

  // --- Plan de marcaciones ------------------------------------------------------------------
  const cal = await ctx.calendario.obtener(db);
  let semilla = 20261106;
  const azar = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;
  const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1));
  const a = (fecha: string, hora: string, deltaMin = 0) => new Date(desdeLocal(fecha, hora).getTime() + deltaMin * 60_000);

  interface Marca { momento: Date; codigo: Codigo; offline?: boolean }
  const marcas: Marca[] = [];
  const turno = (codigo: Codigo, entrada: Date, salida: Date | null, offline = false) => {
    marcas.push({ momento: entrada, codigo, offline });
    if (salida) marcas.push({ momento: salida, codigo, offline });
  };
  /** Casos especiales que se resuelven después, desde el panel. */
  const caso: Record<string, string> = {};
  const festivosDelPeriodo: string[] = [];
  // Último día laborable de Laura antes de ayer: la tablet estuvo sin red y sincronizó después.
  let diaOffline = sumarDias(hoy, -2);
  while (diaSemana(diaOffline) === 0 || cal.esFestivo(diaOffline)) diaOffline = sumarDias(diaOffline, -1);
  const diasOffline = new Set([diaOffline]);
  const trabajados: Record<string, number> = {};
  const k = (c: Codigo) => (trabajados[c] = (trabajados[c] ?? 0) + 1) - 1;

  for (let fecha = inicio; fecha <= hoy; fecha = sumarDias(fecha, 1)) {
    const ds = diaSemana(fecha);
    const semanaN = Math.floor((Date.parse(fecha) - Date.parse(inicio)) / (7 * 86_400_000));
    const festivo = cal.esFestivo(fecha);
    if (festivo) festivosDelPeriodo.push(fecha);
    const mañana = sumarDias(fecha, 1);

    // Laura: bodega, rota mañana/tarde cada semana. Descansa domingos y festivos.
    // La última semana completa es temporada alta: +2,5 h diarias → alertas de 2 h/día y 12 h/semana.
    if (ds !== 0 && !festivo && azar() > 0.04) {
      const [ini, fin] = semanaN % 2 === 0 ? ["06:00", "13:30"] : ["13:30", "21:00"];
      const extra = semanaN === 3 ? entre(150, 175) : azar() < 0.3 ? entre(20, 100) : entre(0, 4);
      turno("2001", a(fecha, ini, entre(-6, 3)), a(fecha, fin, extra), diasOffline.has(fecha));
      k("2001");
    }

    // Andrés: turno tarde 14:00-21:30 (parte nocturna desde las 19:00); trabaja los festivos.
    // Un domingo hace inventario: todo es extra dominical.
    if (ds !== 0) {
      const extra = azar() < 0.4 ? entre(30, 110) : entre(0, 5);
      turno("2002", a(fecha, "14:00", entre(-5, 4)), a(fecha, "21:30", extra));
      k("2002");
    } else if (semanaN === 2) {
      turno("2002", a(fecha, "07:00", entre(-3, 3)), a(fecha, "13:00", entre(0, 10)));
      caso.domingoAndres = fecha;
    }

    // Paola: turno noche 22:00-05:30, de domingo a viernes (domingos y festivos con recargo).
    if (ds !== 6) {
      const extra = azar() < 0.3 ? entre(40, 110) : entre(0, 5);
      turno("2003", a(fecha, "22:00", entre(-8, 2)), a(mañana, "05:30", extra));
      k("2003");
    }

    // Jhon: administrativo. Casos de aprobación de extras según el día trabajado.
    if (ds >= 1 && ds <= 5) {
      const n = k("2004");
      const salidas: Record<number, [string, string]> = {
        3: ["18:30", "aprobar"],
        7: ["19:45", "parcial"],
        11: ["18:20", "rechazar"],
        15: ["18:45", "corregir"],
        18: ["19:00", "pendiente"],
      };
      const especial = salidas[n];
      const entrada = a(fecha, "08:00", entre(-3, 3));
      const salida = especial ? a(fecha, especial[0], entre(-2, 2)) : a(fecha, "17:00", entre(0, 10));
      turno("2004", entrada, salida);
      if (especial) caso[`jhon_${especial[1]}`] = fecha;
      if (festivo) caso.festivoJhon = fecha;
    } else if (ds === 6 && semanaN === 1) {
      // Sábado de inventario: día no laborable en su horario → todo es extra (pendiente de aprobación).
      turno("2004", a(fecha, "08:00", entre(0, 4)), a(fecha, "12:30", entre(0, 6)));
      caso.sabadoJhon = fecha;
    }

    // Diana: administrativa. Descansa los festivos. Olvido de salida, kiosko caído, entrada tarde.
    if (ds >= 1 && ds <= 5 && !festivo) {
      const n = k("2005");
      const entrada = a(fecha, "08:00", entre(-4, 3));
      if (n === 5) {
        turno("2005", entrada, null); // olvida marcar la salida
        caso.olvidoDiana = fecha;
      } else if (n === 9) {
        caso.kioskoCaido = fecha; // no hay marcas: se registra a mano
      } else if (n === 13) {
        turno("2005", a(fecha, "09:35"), a(fecha, "17:00", entre(0, 8))); // marcó al volver de una reunión
        caso.entradaTardeDiana = fecha;
      } else if (n === 16 || n === 17) {
        turno("2005", entrada, a(fecha, "17:50", entre(0, 10))); // extras que se aprueban en lote
        caso[`loteDiana${n}`] = fecha;
      } else {
        turno("2005", entrada, a(fecha, "17:00", entre(0, 9)));
      }
    } else if (ds === 6 && semanaN === 2) {
      caso.anularDiana = fecha;
    }

    // Carlos: sin horario asignado (jornada legal L-S de 7 h, extras automáticas).
    // Sale a las 05:00: la primera hora es nocturna.
    // Hace pocos días olvidó marcar la salida: el turno queda "por revisar" en el panel.
    if (ds !== 0) {
      const extra = azar() < 0.35 ? entre(30, 150) : entre(0, 5);
      const olvido = !caso.olvidoCarlos && fecha >= sumarDias(hoy, -5) && fecha < sumarDias(hoy, -1);
      turno("2006", a(fecha, "05:00", entre(-4, 4)), olvido ? null : a(fecha, "12:00", extra));
      if (olvido) caso.olvidoCarlos = fecha;
      k("2006");
    }

    // Sofía: temporal, solo las dos primeras semanas.
    if (semanaN < 2 && ds !== 0 && !festivo) {
      const extra = azar() < 0.25 ? entre(30, 80) : entre(0, 3);
      turno("2007", a(fecha, "06:00", entre(-5, 5)), a(fecha, "13:30", extra));
      k("2007");
    }
  }

  // --- Kiosko: marcaciones en orden cronológico ---------------------------------------------
  const ahora = Date.now();
  const enLinea = marcas.filter((m) => !m.offline && m.momento.getTime() < ahora).sort((x, y) => x.momento.getTime() - y.momento.getTime());
  const offline = marcas.filter((m) => m.offline && m.momento.getTime() < ahora).sort((x, y) => x.momento.getTime() - y.momento.getTime());
  const corteOffline = offline[0]?.momento.getTime() ?? Infinity;
  const avisos: string[] = [];

  const marcar = async (m: Marca) => {
    const r = await ctx.marcaciones.marcar(m.codigo, { momento: m.momento }).catch((e: Error) => {
      throw new Error(`Marcación de ${m.codigo} a las ${m.momento.toISOString()}: ${e.message}`);
    });
    if (r.aviso) avisos.push(`${m.codigo} ${fechaLocal(m.momento)}: ${r.aviso}`);
  };
  // Las marcas de Laura del día sin conexión se envían al "reconectar", antes de su siguiente turno.
  for (const m of enLinea.filter((x) => x.codigo !== "2001" || x.momento.getTime() < corteOffline)) await marcar(m);
  if (offline.length) await sincronizarOffline(offline);
  for (const m of enLinea.filter((x) => x.codigo === "2001" && x.momento.getTime() >= corteOffline)) await marcar(m);

  async function sincronizarOffline(lista: Marca[]) {
    // La tablet tenía el reloj 3 minutos atrasado: el servidor lo corrige con la hora de envío.
    const atraso = 3 * 60_000;
    const capt = (d: Date) => new Date(d.getTime() - atraso).toISOString();
    const marcasTablet: { id: string; codigo: string; capturadoEn: string }[] = lista.map((m) => ({ id: randomUUID(), codigo: m.codigo, capturadoEn: capt(m.momento) }));
    // Doble toque en la pantalla 20 s después de la entrada: se descarta solo.
    marcasTablet.push({ id: randomUUID(), codigo: "2001", capturadoEn: capt(new Date(lista[0]!.momento.getTime() + 20_000)) });
    // Código mal digitado: queda en la bandeja para un supervisor.
    marcasTablet.push({ id: randomUUID(), codigo: CODIGO_INVALIDO, capturadoEn: capt(new Date(lista[0]!.momento.getTime() + 5 * 60_000)) });
    marcasTablet.push({ id: randomUUID(), codigo: CODIGO_INVALIDO, capturadoEn: capt(new Date(lista[0]!.momento.getTime() + 7 * 60_000)) });
    const r = await llamar<{ resultados: { id: string; estado: string }[] }>("", "POST", "/api/kiosko/sincronizar", {
      enviadoEn: new Date(Date.now() - atraso).toISOString(),
      dispositivo: "Tablet portería bodega",
      marcas: marcasTablet,
    });
    const rechazada = r.resultados.find((x) => x.estado === "RECHAZADA");
    if (rechazada) {
      await llamar(sup, "POST", `/api/marcaciones/offline/${rechazada.id}/resolver`, {
        nota: "Era Laura Gómez (2001) digitando mal su código; su turno ya quedó registrado. Sin acción.",
      });
    }
  }

  // --- Panel de supervisión: correcciones, aprobaciones y anulaciones -----------------------
  const unaDe = async (codigo: Codigo, fecha: string) => {
    const [m] = await db
      .select()
      .from(marcaciones)
      .where(
        and(
          eq(marcaciones.empleadoId, emp[codigo].id),
          ne(marcaciones.estado, "ANULADA"),
          gte(marcaciones.entrada, desdeLocal(fecha)),
          lt(marcaciones.entrada, desdeLocal(sumarDias(fecha, 1))),
        ),
      )
      .orderBy(marcaciones.entrada)
      .limit(1);
    if (!m) throw new Error(`No hay marcación de ${codigo} el ${fecha}`);
    return m;
  };
  const extras = (id: number, cuerpo: object) => llamar(sup, "POST", `/api/marcaciones/${id}/extras`, cuerpo);
  const si = async (clave: string, fn: (fecha: string) => Promise<unknown>) => {
    const f = caso[clave];
    if (f) await fn(f);
  };

  await si("jhon_aprobar", async (f) => extras((await unaDe("2004", f)).id, { aprobar: true, motivo: "Cierre de facturación del mes, autorizado por la coordinación." }));
  await si("jhon_parcial", async (f) =>
    extras((await unaDe("2004", f)).id, { aprobar: true, minutos: 90, motivo: "Se autorizó 1,5 h para el informe a la DIAN; el resto no fue solicitado." }),
  );
  await si("jhon_rechazar", async (f) =>
    extras((await unaDe("2004", f)).id, { aprobar: false, motivo: "No fue solicitada ni autorizada previamente por la coordinación." }),
  );
  await si("jhon_corregir", async (f) => {
    const m = await unaDe("2004", f);
    await extras(m.id, { aprobar: true, motivo: "Conciliación bancaria de fin de mes." });
    // Al corregir las horas, la aprobación anterior se anula y vuelve a quedar pendiente.
    await llamar(sup, "PATCH", `/api/marcaciones/${m.id}`, {
      salida: a(f, "18:15").toISOString(),
      motivo: "Marcó la salida tarde al volver por su cargador; el control de acceso registra salida a las 18:15.",
    });
    await extras(m.id, { aprobar: true, motivo: "Se vuelve a aprobar con la hora corregida." });
  });
  await si("sabadoJhon", async (f) => extras((await unaDe("2004", f)).id, { aprobar: true, motivo: "Inventario semestral programado por gerencia." }));

  await si("olvidoDiana", async (f) => {
    const m = await unaDe("2005", f);
    await llamar(sup, "PATCH", `/api/marcaciones/${m.id}`, {
      salida: a(f, "17:04").toISOString(),
      observacion: "Salida registrada por supervisión.",
      motivo: "Olvidó marcar la salida; la hora la confirma el registro del torniquete y su jefe inmediato.",
    });
  });
  await si("kioskoCaido", (f) =>
    llamar(sup, "POST", "/api/marcaciones", {
      empleadoId: emp["2005"].id,
      entrada: a(f, "07:58").toISOString(),
      salida: a(f, "17:03").toISOString(),
      observacion: "Kiosko sin energía toda la jornada.",
      motivo: "Corte de energía en portería; horas tomadas de la planilla física firmada por la empleada.",
    }),
  );
  await si("entradaTardeDiana", async (f) => {
    const m = await unaDe("2005", f);
    await llamar(sup, "PATCH", `/api/marcaciones/${m.id}`, {
      entrada: a(f, "08:02").toISOString(),
      motivo: "Llegó a las 08:02 (torniquete) y pasó directo a una reunión; marcó al salir de ella a las 09:35.",
    });
  });
  await si("anularDiana", async (f) => {
    const m = await llamar(sup, "POST", "/api/marcaciones", {
      empleadoId: emp["2005"].id,
      entrada: a(f, "08:00").toISOString(),
      salida: a(f, "12:00").toISOString(),
      motivo: "Registro del inventario del sábado.",
    });
    await llamar(sup, "POST", `/api/marcaciones/${m.id}/anular`, {
      motivo: "Registrado por error en Diana Moreno; el inventario lo hizo Jhon Restrepo.",
    });
  });
  const lote: number[] = [];
  for (const c of ["loteDiana16", "loteDiana17"]) if (caso[c]) lote.push((await unaDe("2005", caso[c]!)).id);
  if (lote.length) await llamar(sup, "POST", "/api/marcaciones/extras/aprobar-lote", { ids: lote });

  // --- Datos maestros: cambio de salario con recálculo y baja del temporal ------------------
  await llamar(admin, "PUT", `/api/empleados/${emp["2006"].id}`, {
    ...datosEmpleados["2006"], identificacion: "2006", fechaIngreso: sumarDias(inicio, -60), salario: 2_050_000,
    motivo: "Ascenso a conductor líder desde el inicio del periodo (otrosí firmado).",
  });
  await llamar(admin, "POST", "/api/marcaciones/recalcular", { desde: inicio, hasta: hoy, empleadoId: emp["2006"].id });
  await llamar(admin, "PUT", `/api/empleados/${emp["2007"].id}`, {
    ...datosEmpleados["2007"], identificacion: "2007", fechaIngreso: sumarDias(inicio, -60), activo: false,
    motivo: "Fin del contrato temporal por temporada alta.",
  });

  // --- Resumen ------------------------------------------------------------------------------
  const rep = await llamar<any>(admin, "GET", `/api/reportes/liquidacion?desde=${inicio}&hasta=${hoy}`);
  const dash = await llamar<any>(admin, "GET", "/api/dashboard");
  const [cuenta] = await db.select({ n: sql<number>`count(*)::int` }).from(marcaciones).where(inArray(marcaciones.empleadoId, Object.values(emp).map((e) => e.id)));
  const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;

  console.log(`\n✔ Simulación creada del ${inicio} al ${hoy}: ${CODIGOS.length} empleados, 3 horarios, ${cuenta?.n ?? 0} marcaciones.`);
  console.log(`  Festivos en el periodo: ${festivosDelPeriodo.map((f) => `${f} (${cal.nombre(f)})`).join(", ") || "ninguno"}`);
  console.log(`  Supervisor: ${EMAIL_SUPERVISOR} / ${passSupervisor}\n`);
  console.log("  Empleado                 Turnos  Horas   Extras  Pend.  Recargos y extras");
  for (const f of rep.datos) {
    console.log(
      `  ${f.nombre.padEnd(24)} ${String(f.turnos).padStart(6)}  ${formatearMinutos(f.minutosTotales).padStart(6)}  ${formatearMinutos(f.minutosExtra).padStart(6)}  ${formatearMinutos(f.minutosExtraPendientes).padStart(5)}  ${pesos(f.valorTotal)}`,
    );
    for (const al of f.alertas) console.log(`      ⚠ ${al}`);
  }
  console.log("\n  Por categoría:");
  for (const [cat, v] of Object.entries(rep.totales.categorias as Record<string, { minutos: number; valor: number }>)) {
    if (v.minutos) console.log(`    ${cat.padEnd(16)} ${formatearMinutos(v.minutos).padStart(7)} h  ${pesos(v.valor)}`);
  }
  console.log(
    `\n  Panel: ${dash.presentes.length} en turno, ${dash.extrasPendientes.marcaciones} con extras por aprobar, ` +
      `${dash.enRevision} por revisar, ${dash.offlineRechazadas} marcación sin conexión por resolver.`,
  );
  for (const av of avisos) console.log(`  Kiosko: ${av}`);
}

// ---------------------------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------------------------

async function limpiar() {
  const emps = await db.select({ id: empleados.id }).from(empleados).where(inArray(empleados.identificacion, [...CODIGOS]));
  const hors = await db.select({ id: horarios.id }).from(horarios).where(like(horarios.nombre, `%${SUFIJO}`));
  const idsEmp = emps.map((e) => e.id);
  const idsHor = hors.map((h) => h.id);
  await db.transaction(async (tx) => {
    const marcs = idsEmp.length
      ? (await tx.select({ id: marcaciones.id }).from(marcaciones).where(inArray(marcaciones.empleadoId, idsEmp))).map((m) => m.id)
      : [];
    const condiciones = [
      marcs.length ? and(eq(auditoria.entidad, "marcacion"), inArray(auditoria.entidadId, marcs)) : undefined,
      idsEmp.length ? and(eq(auditoria.entidad, "empleado"), inArray(auditoria.entidadId, idsEmp)) : undefined,
      idsHor.length ? and(eq(auditoria.entidad, "horario"), inArray(auditoria.entidadId, idsHor)) : undefined,
    ].filter(Boolean);
    if (condiciones.length) await tx.delete(auditoria).where(or(...condiciones));
    await tx.delete(marcasOffline).where(inArray(marcasOffline.codigo, [...CODIGOS, CODIGO_INVALIDO]));
    if (idsEmp.length) {
      await tx.delete(marcaciones).where(inArray(marcaciones.empleadoId, idsEmp));
      await tx.delete(empleados).where(inArray(empleados.id, idsEmp));
    }
    if (idsHor.length) await tx.delete(horarios).where(inArray(horarios.id, idsHor));
    await tx.delete(usuarios).where(sql`lower(${usuarios.email}) = ${EMAIL_SUPERVISOR.toLowerCase()}`);
  });
  console.log(`✔ Simulación eliminada: ${idsEmp.length} empleados y ${idsHor.length} horarios con sus marcaciones y auditoría.`);
}
