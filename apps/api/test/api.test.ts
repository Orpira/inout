import { desdeLocal, establecerZona, ZONA_PREDETERMINADA } from "@inout/core";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { construirApp } from "../src/app.js";
import { crearDb } from "../src/db/client.js";
import { migrar } from "../src/db/migrate.js";
import { usuarios } from "../src/db/schema.js";
import { cargarEnv } from "../src/env.js";
import { hashPassword } from "../src/rutas/auth.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/inout_test";
const env = cargarEnv({
  NODE_ENV: "test",
  DATABASE_URL: URL,
  JWT_SECRET: "x".repeat(40),
  ANTIREBOTE_SEGUNDOS: "0",
});
const { db, cliente } = crearDb(URL);
let app: FastifyInstance;
let cookieAdmin = "";
let cookieSup = "";

async function login(email: string, password: string) {
  const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  return { r, cookie: String(r.headers["set-cookie"] ?? "").split(";")[0]! };
}
const api = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object, cookie = cookieAdmin) =>
  app.inject({ method, url, payload, headers: { cookie } });

beforeAll(async () => {
  await migrar(URL);
  ({ app } = await construirApp(env, { db, logger: false }));
});

afterAll(async () => {
  await app.close();
  await cliente.end();
});

beforeEach(async () => {
  app.ctx.calendario.invalidar();
  establecerZona(ZONA_PREDETERMINADA);
  await db.execute(sql`truncate marcas_offline, auditoria, liquidacion_lineas, marcaciones, empleados, horarios, usuarios, festivos_ajustes, ajustes restart identity cascade`);
  await db.insert(usuarios).values([
    { nombre: "Admin", email: "admin@test.co", passwordHash: await hashPassword("clave-admin"), rol: "ADMIN" },
    // Hash generado por Laravel (bcrypt $2y$) para "password"
    { nombre: "Sup", email: "sup@test.co", passwordHash: "$2y$10$kl5AtKA6uXoPVNecpNa25.cHX1kwcLEZ1GtuoKvofXLOb5Oo0i2cu", rol: "SUPERVISOR" },
  ]);
  cookieAdmin = (await login("admin@test.co", "clave-admin")).cookie;
  cookieSup = (await login("sup@test.co", "password")).cookie;
});

async function crearEmpleado(datos: Partial<{ identificacion: string; salario: number; horarioId: number }> = {}) {
  const r = await api("POST", "/api/empleados", {
    identificacion: datos.identificacion ?? "1001",
    nombre: "Laura",
    apellido: "Gómez",
    salario: datos.salario ?? 2_100_000,
    horarioId: datos.horarioId ?? null,
  });
  expect(r.statusCode).toBe(201);
  return r.json() as { id: number };
}

describe("autenticación y permisos", () => {
  it("rechaza credenciales inválidas y acepta hashes de Laravel ($2y$)", async () => {
    expect((await login("admin@test.co", "mala")).r.statusCode).toBe(401);
    expect(cookieSup).toMatch(/^inout_sesion=/);
    const me = await api("GET", "/api/auth/me", undefined, cookieSup);
    expect(me.json().usuario.rol).toBe("SUPERVISOR");
  });

  it("protege rutas y roles", async () => {
    expect((await app.inject({ method: "GET", url: "/api/empleados" })).statusCode).toBe(401);
    expect((await api("GET", "/api/usuarios", undefined, cookieSup)).statusCode).toBe(403);
    expect((await api("POST", "/api/empleados", { identificacion: "x" }, cookieSup)).statusCode).toBe(403);
  });

  it("valida el cuerpo con mensajes legibles", async () => {
    const r = await api("POST", "/api/empleados", { identificacion: "1", nombre: "", apellido: "A", salario: -1 });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe("VALIDACION");
  });
});

describe("kiosko", () => {
  it("alterna entrada y salida y liquida al cerrar", async () => {
    await crearEmpleado();
    const info = await app.inject({ method: "GET", url: "/api/kiosko/empleado/1001" });
    expect(info.json().proximaMarca).toBe("ENTRADA");

    const e = await app.inject({ method: "POST", url: "/api/kiosko/marcar", payload: { codigo: "1001" } });
    expect(e.json().tipo).toBe("ENTRADA");
    const lista = (await api("GET", "/api/empleados")).json();
    expect(lista.datos[0].enTurno).toBe(true);
    const s = await app.inject({ method: "POST", url: "/api/kiosko/marcar", payload: { codigo: "1001" } });
    expect(s.json().tipo).toBe("SALIDA");
    expect(s.json().marcacion.minutosTotales).toBe(0);
  });

  it("responde 404 con códigos desconocidos", async () => {
    await crearEmpleado();
    expect((await app.inject({ method: "POST", url: "/api/kiosko/marcar", payload: { codigo: "999" } })).statusCode).toBe(404);
  });

  it("envía a revisión los turnos sin salida vencidos", async () => {
    const { id } = await crearEmpleado();
    await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: new Date(Date.now() - 20 * 3_600_000).toISOString(),
      motivo: "Prueba de vencimiento",
    });
    expect(await app.ctx.marcaciones.enviarVencidasARevision()).toBe(1);
    const r = await api("GET", "/api/marcaciones?estado=REVISION");
    expect(r.json().total).toBe(1);
  });
});

describe("marcaciones manuales, edición y reportes", () => {
  it("crea, impide solapes, edita con auditoría y reporta la liquidación", async () => {
    const { id } = await crearEmpleado({ salario: 2_100_000 });
    const crear = await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: desdeLocal("2026-11-04", "08:00").toISOString(),
      salida: desdeLocal("2026-11-04", "18:00").toISOString(),
      motivo: "Olvidó marcar en el kiosko",
    });
    expect(crear.statusCode).toBe(201);
    const m = crear.json();

    const solape = await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: desdeLocal("2026-11-04", "17:00").toISOString(),
      salida: desdeLocal("2026-11-04", "19:00").toISOString(),
      motivo: "Debe fallar por solape",
    });
    expect(solape.statusCode).toBe(409);

    const detalle = (await api("GET", `/api/marcaciones/${m.id}`)).json();
    expect(detalle.minutosExtra).toBe(180);
    expect(detalle.valorRecargos).toBe(37_500);

    const sinCambios = await api("PATCH", `/api/marcaciones/${m.id}`, { motivo: "No cambia nada aquí" });
    expect(sinCambios.statusCode).toBe(400);

    const sinMotivo = await api("PATCH", `/api/marcaciones/${m.id}`, { salida: desdeLocal("2026-11-04", "16:00").toISOString() });
    expect(sinMotivo.statusCode).toBe(400);

    const editar = await api("PATCH", `/api/marcaciones/${m.id}`, {
      salida: desdeLocal("2026-11-04", "16:00").toISOString(),
      motivo: "Corrección por supervisor",
    }, cookieSup);
    expect(editar.statusCode).toBe(200);
    expect(editar.json().minutosExtra).toBe(60);

    const conHistorial = (await api("GET", `/api/marcaciones/${m.id}`)).json();
    expect(conHistorial.historial.map((h: { accion: string }) => h.accion)).toEqual(["EDITAR", "CREAR"]);
    expect(conHistorial.historial[0].usuario).toBe("Sup");

    const rep = (await api("GET", "/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30")).json();
    expect(rep.totales.minutosExtra).toBe(60);
    expect(rep.datos[0].categorias.EXT_DIURNA).toEqual({ minutos: 60, valor: 12_500 });

    const csv = await api("GET", "/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30&formato=csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("Laura Gómez");

    const anular = await api("POST", `/api/marcaciones/${m.id}/anular`, { motivo: "Registro duplicado" });
    expect(anular.json().estado).toBe("ANULADA");
    const rep2 = (await api("GET", "/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30")).json();
    expect(rep2.datos).toHaveLength(0);
  });

  it("los festivos ajustados se aplican tras recalcular", async () => {
    const { id } = await crearEmpleado();
    await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: desdeLocal("2026-11-04", "08:00").toISOString(),
      salida: desdeLocal("2026-11-04", "15:00").toISOString(),
      motivo: "Turno ordinario",
    });
    expect((await api("POST", "/api/config/festivos/ajustes", { fecha: "2026-11-04", tipo: "AGREGAR", descripcion: "Día cívico" })).statusCode).toBe(400);
    await api("POST", "/api/config/festivos/ajustes", { fecha: "2026-11-04", tipo: "AGREGAR", descripcion: "Día cívico", motivo: "Decreto municipal de día cívico" });
    await api("POST", "/api/marcaciones/recalcular", { desde: "2026-11-04", hasta: "2026-11-04" });
    const lista = (await api("GET", "/api/marcaciones?desde=2026-11-04&hasta=2026-11-04")).json();
    expect(lista.datos[0].valorRecargos).toBe(63_000); // 7 h × 10.000 × 0,9
  });

  it("dashboard y gestión de usuarios", async () => {
    const d = await api("GET", "/api/dashboard");
    expect(d.statusCode).toBe(200);
    expect(d.json().serie).toHaveLength(14);
    expect(d.json().parametros.jornadaSemanal).toBe(42);

    const u = await api("POST", "/api/usuarios", { nombre: "Nuevo", email: "nuevo@test.co", rol: "SUPERVISOR", password: "12345678" });
    expect(u.statusCode).toBe(201);
    const dup = await api("POST", "/api/usuarios", { nombre: "Otro", email: "NUEVO@test.co", rol: "SUPERVISOR", password: "12345678" });
    expect(dup.statusCode).toBe(409);
  });
});

const horarioAdministrativo = {
  nombre: "Administrativo L-V",
  tipo: "FIJO",
  dias: [0, 1, 2, 3, 4, 5, 6].map((d) =>
    d >= 1 && d <= 5 ? { laborable: true, inicio: "08:00", fin: "17:00" } : { laborable: false },
  ),
  descanso: { tipo: "VENTANA", inicio: "12:00", fin: "13:00" },
  toleranciaMinutos: 15,
  requiereAprobacion: true,
};
const marcarManual = (empleadoId: number, fecha: string, ini: string, fin: string) =>
  api("POST", "/api/marcaciones", {
    empleadoId,
    entrada: desdeLocal(fecha, ini).toISOString(),
    salida: desdeLocal(fecha, fin).toISOString(),
    motivo: "Carga de prueba",
  });

describe("horarios y aprobación de horas extra", () => {
  it("valida horarios según la Ley 2101", async () => {
    const malo = { ...horarioAdministrativo, dias: horarioAdministrativo.dias.map((d) => (d.laborable ? { ...d, fin: "19:00" } : d)) };
    const r = await api("POST", "/api/horarios", malo);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/9 horas/);
    const ok = await api("POST", "/api/horarios", horarioAdministrativo);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().dias[1].minutos).toBe(480);
    expect((await api("POST", "/api/horarios", horarioAdministrativo, cookieSup)).statusCode).toBe(403);
  });

  it("administrativo: descuenta almuerzo, aplica tolerancia y exige aprobación", async () => {
    const h = (await api("POST", "/api/horarios", horarioAdministrativo)).json();
    const { id } = await crearEmpleado({ horarioId: h.id });

    // 10 minutos tarde: dentro de la tolerancia, no genera extras.
    const tol = (await marcarManual(id, "2026-11-03", "08:00", "17:10")).json();
    expect((await api("GET", `/api/marcaciones/${tol.id}`)).json()).toMatchObject({ estadoExtras: "TOLERANCIA", minutosExtra: 0, minutosDescanso: 60 });

    // 2 horas extra: quedan pendientes y no se liquidan.
    const m = (await marcarManual(id, "2026-11-04", "08:00", "19:00")).json();
    let d = (await api("GET", `/api/marcaciones/${m.id}`)).json();
    expect(d).toMatchObject({ estadoExtras: "PENDIENTE", minutosExtraCalculados: 120, minutosExtra: 0, valorRecargos: 0 });
    const pend = (await api("GET", "/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30")).json();
    expect(pend.totales.minutosExtraPendientes).toBe(120);

    // El rechazo exige motivo; la aprobación parcial liquida solo lo aprobado.
    expect((await api("POST", `/api/marcaciones/${m.id}/extras`, { aprobar: false })).statusCode).toBe(400);
    const ap = await api("POST", `/api/marcaciones/${m.id}/extras`, { aprobar: true, minutos: 60 }, cookieSup);
    expect(ap.statusCode).toBe(200);
    d = (await api("GET", `/api/marcaciones/${m.id}`)).json();
    expect(d).toMatchObject({ estadoExtras: "APROBADAS", minutosExtra: 60, valorRecargos: 12_500 });
    expect(d.historial[0].accion).toBe("APROBAR_EXTRAS");

    // Si cambian las horas, la aprobación se invalida.
    await api("PATCH", `/api/marcaciones/${m.id}`, { salida: desdeLocal("2026-11-04", "18:30").toISOString(), motivo: "Ajuste de salida" });
    d = (await api("GET", `/api/marcaciones/${m.id}`)).json();
    expect(d).toMatchObject({ estadoExtras: "PENDIENTE", minutosExtraCalculados: 90 });

    const lote = await api("POST", "/api/marcaciones/extras/aprobar-lote", { ids: [m.id, tol.id] });
    expect(lote.json().aprobadas).toBe(1);
  });

  it("administrativo: el sábado es todo hora extra", async () => {
    const h = (await api("POST", "/api/horarios", { ...horarioAdministrativo, requiereAprobacion: false })).json();
    const { id } = await crearEmpleado({ horarioId: h.id });
    const m = (await marcarManual(id, "2026-10-31", "08:00", "12:00")).json();
    expect((await api("GET", `/api/marcaciones/${m.id}`)).json()).toMatchObject({ estadoExtras: "AUTOMATICAS", minutosExtra: 240, valorRecargos: 50_000 });
  });
});

describe("kiosko sin conexión", () => {
  const uuid = () => crypto.randomUUID();
  const sincronizar = (marcas: { id: string; codigo: string; capturadoEn: string }[], enviadoEn = new Date()) =>
    app.inject({ method: "POST", url: "/api/kiosko/sincronizar", payload: { enviadoEn: enviadoEn.toISOString(), dispositivo: "Tablet bodega", marcas } });

  it("aplica en orden, corrige el reloj del dispositivo y es idempotente", async () => {
    await crearEmpleado();
    const hace = (h: number) => new Date(Date.now() - h * 3_600_000);
    const atraso = 10 * 60_000; // reloj de la tablet 10 minutos atrasado
    const salida = { id: uuid(), codigo: "1001", capturadoEn: new Date(hace(20).getTime() - atraso).toISOString() };
    const entrada = { id: uuid(), codigo: "1001", capturadoEn: new Date(hace(28).getTime() - atraso).toISOString() };
    // Se envían desordenadas: el servidor las ordena por hora de captura.
    const r = await sincronizar([salida, entrada], new Date(Date.now() - atraso));
    expect(r.statusCode).toBe(200);
    expect(r.json().resultados.map((x: { tipo: string }) => x.tipo)).toEqual(["SALIDA", "ENTRADA"]);

    const lista = (await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2030-01-01")).json();
    expect(lista.total).toBe(1);
    expect(lista.datos[0].origen).toBe("KIOSKO_OFFLINE");
    expect(lista.datos[0].minutosTotales).toBe(8 * 60);
    expect(Math.abs(new Date(lista.datos[0].entrada).getTime() - hace(28).getTime())).toBeLessThan(5_000);

    // Reenviar el mismo lote no duplica nada.
    const otra = await sincronizar([entrada, salida], new Date(Date.now() - atraso));
    expect(otra.json().resultados.map((x: { estado: string }) => x.estado)).toEqual(["APLICADA", "APLICADA"]);
    expect((await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2030-01-01")).json().total).toBe(1);
  });

  it("registra las rechazadas para que un supervisor las resuelva", async () => {
    await crearEmpleado();
    const vieja = { id: uuid(), codigo: "1001", capturadoEn: new Date(Date.now() - 200 * 3_600_000).toISOString() };
    const desconocida = { id: uuid(), codigo: "777", capturadoEn: new Date(Date.now() - 3_600_000).toISOString() };
    const r = (await sincronizar([vieja, desconocida])).json();
    expect(r.resultados.map((x: { estado: string }) => x.estado)).toEqual(["RECHAZADA", "RECHAZADA"]);

    const bandeja = (await api("GET", "/api/marcaciones/offline")).json();
    expect(bandeja.datos).toHaveLength(2);
    const res = await api("POST", `/api/marcaciones/offline/${vieja.id}/resolver`, { nota: "Registrada manualmente" });
    expect(res.json().estado).toBe("RESUELTA");
    expect((await api("GET", "/api/dashboard")).json().offlineRechazadas).toBe(1);
  });

  it("una salida recibida tarde cierra el turno que había pasado a revisión", async () => {
    const { id } = await crearEmpleado();
    await api("POST", "/api/marcaciones", { empleadoId: id, entrada: new Date(Date.now() - 20 * 3_600_000).toISOString(), motivo: "Entrada de prueba" });
    expect(await app.ctx.marcaciones.enviarVencidasARevision()).toBe(1);
    const r = (await sincronizar([{ id: uuid(), codigo: "1001", capturadoEn: new Date(Date.now() - 12 * 3_600_000).toISOString() }])).json();
    expect(r.resultados[0]).toMatchObject({ estado: "APLICADA", tipo: "SALIDA" });
    const lista = (await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2030-01-01")).json();
    expect(lista.total).toBe(1);
    expect(lista.datos[0]).toMatchObject({ estado: "CERRADA", minutosTotales: 8 * 60 });
  });

  it("el directorio sin conexión exige token de kiosko", async () => {
    expect((await app.inject({ method: "GET", url: "/api/kiosko/directorio" })).statusCode).toBe(403);
  });
});

describe("auditoría de datos maestros", () => {
  it("registra con motivo los cambios de empleados, horarios y festivos", async () => {
    const { id } = await crearEmpleado();
    const base = { identificacion: "1001", nombre: "Laura", apellido: "Gómez", salario: 2_300_000 };
    expect((await api("PUT", `/api/empleados/${id}`, base)).statusCode).toBe(400); // sin motivo
    const ok = await api("PUT", `/api/empleados/${id}`, { ...base, motivo: "Incremento salarial 2026" });
    expect(ok.statusCode).toBe(200);
    expect((await api("PUT", `/api/empleados/${id}`, { ...base, motivo: "Sin cambios reales" })).statusCode).toBe(400);
    const hist = (await api("GET", `/api/config/auditoria?entidad=empleado&entidadId=${id}`)).json().datos;
    expect(hist.map((h: { accion: string }) => h.accion)).toEqual(["EDITAR", "CREAR"]);
    expect(hist[0]).toMatchObject({ motivo: "Incremento salarial 2026", antes: { salario: 2_100_000 }, despues: { salario: 2_300_000 }, usuario: "Admin" });

    const h = (await api("POST", "/api/horarios", horarioAdministrativo)).json();
    const edit = await api("PUT", `/api/horarios/${h.id}`, { ...horarioAdministrativo, toleranciaMinutos: 10, motivo: "Acuerdo con el comité" });
    expect(edit.statusCode).toBe(200);
    const hh = (await api("GET", `/api/config/auditoria?entidad=horario&entidadId=${h.id}`)).json().datos;
    expect(hh[0].despues).toEqual({ toleranciaMinutos: 10 });

    await api("POST", "/api/config/festivos/ajustes", { fecha: "2026-07-13", tipo: "QUITAR", motivo: "Sentencia de la Corte" });
    const del = await api("DELETE", "/api/config/festivos/ajustes/2026-07-13", { motivo: "Se revoca el ajuste" });
    expect(del.statusCode).toBe(200);
    const hf = (await api("GET", "/api/config/auditoria?entidad=festivo")).json().datos;
    expect(hf.map((x: { accion: string }) => x.accion)).toEqual(["RESTAURAR_FESTIVO", "QUITAR_FESTIVO"]);
  });
});

describe("gráfica de horas trabajadas del inicio", () => {
  it("muestra lo trabajado aunque las extras estén por aprobar, y los turnos en curso", async () => {
    const h = (await api("POST", "/api/horarios", horarioAdministrativo)).json();
    const { id } = await crearEmpleado({ horarioId: h.id });
    const ayer = new Date(Date.now() - 24 * 3_600_000);
    const fecha = ayer.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const dia = new Date(`${fecha}T12:00:00-05:00`).getUTCDay();
    // 08:00-19:00 con almuerzo = 10 h trabajadas (8 ordinarias + 2 extra por aprobar si es laborable).
    await marcarManual(id, fecha, "08:00", "19:00");
    const { id: id2 } = await crearEmpleado({ identificacion: "2002" });
    await api("POST", "/api/marcaciones", { empleadoId: id2, entrada: new Date(Date.now() - 90 * 60_000).toISOString(), motivo: "Turno en curso" });

    const serie = (await api("GET", "/api/dashboard")).json().serie as Array<Record<string, number | string>>;
    const d = serie.find((x) => x.fecha === fecha)!;
    const trabajadas = Number(d.ordinarias) + Number(d.extraLiquidadas) + Number(d.extraPendientes) + Number(d.extraNoReconocidas);
    expect(trabajadas).toBe(600);
    if (dia >= 1 && dia <= 5) expect(d).toMatchObject({ ordinarias: 480, extraPendientes: 120, extraLiquidadas: 0 });
    const enCurso = serie.reduce((t, x) => t + Number(x.enCurso), 0);
    expect(enCurso).toBeGreaterThanOrEqual(89);
    expect(enCurso).toBeLessThanOrEqual(91);
  });
});

describe("zona horaria de la instalación", () => {
  it("se cambia desde administración, se audita y rige fechas, franja nocturna y reportes", async () => {
    const inicial = await api("GET", "/api/config/zona");
    expect(inicial.json()).toEqual({ zona: "America/Bogota", predeterminada: "America/Bogota" });
    expect(inicial.headers["x-zona-horaria"]).toBe("America/Bogota");

    expect((await api("PUT", "/api/config/zona", { zona: "Europe/Madrid", motivo: "Sede en España" }, cookieSup)).statusCode).toBe(403);
    expect((await api("PUT", "/api/config/zona", { zona: "Marte/Olympus", motivo: "Zona inventada" })).statusCode).toBe(400);
    expect((await api("PUT", "/api/config/zona", { zona: "Europe/Madrid" })).statusCode).toBe(400);

    const cambio = await api("PUT", "/api/config/zona", { zona: "Europe/Madrid", motivo: "Sede en España" });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json().zona).toBe("Europe/Madrid");
    expect(cambio.headers["x-zona-horaria"]).toBe("Europe/Madrid");

    const hist = (await api("GET", "/api/config/auditoria?entidad=ajuste")).json();
    expect(hist.datos[0]).toMatchObject({ accion: "CAMBIAR_ZONA_HORARIA", antes: { zona: "America/Bogota" }, despues: { zona: "Europe/Madrid" } });

    // 18:00 a 21:00 en Madrid: 1 h diurna y 2 h nocturnas (desde las 19:00 locales).
    const { id } = await crearEmpleado();
    await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: "2026-11-04T17:00:00.000Z",
      salida: "2026-11-04T20:00:00.000Z",
      motivo: "Turno de prueba en Madrid",
    });
    const rep = (await api("GET", "/api/reportes/liquidacion?desde=2026-11-04&hasta=2026-11-04")).json();
    expect(rep.datos[0].categorias.ORD_DIURNA.minutos).toBe(60);
    expect(rep.datos[0].categorias.ORD_NOCTURNA.minutos).toBe(120);
    const marc = (await api("GET", "/api/reportes/marcaciones?desde=2026-11-04&hasta=2026-11-04")).body;
    expect(marc).toContain("2026-11-04 18:00");

    // Al reiniciar el servidor se conserva la zona guardada.
    establecerZona(ZONA_PREDETERMINADA);
    const { app: otra } = await construirApp(env, { db, logger: false });
    expect(otra.ctx.ajustes.zona()).toBe("Europe/Madrid");
    await otra.close();
  });
});
