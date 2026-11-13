import { desdeLocal, diaSemana, fechaLocal, sumarDias } from "@inout/core";
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
  await db.execute(sql`truncate periodos_liquidados, marcas_offline, auditoria, liquidacion_lineas, marcaciones, empleados, horarios, usuarios, festivos_ajustes restart identity cascade`);
  await db.insert(usuarios).values([
    { nombre: "Admin", email: "admin@test.co", passwordHash: await hashPassword("clave-admin"), rol: "ADMIN" },
    // Hash generado por Laravel (bcrypt $2y$) para "password"
    { nombre: "Sup", email: "sup@test.co", passwordHash: "$2y$10$kl5AtKA6uXoPVNecpNa25.cHX1kwcLEZ1GtuoKvofXLOb5Oo0i2cu", rol: "SUPERVISOR" },
  ]);
  cookieAdmin = (await login("admin@test.co", "clave-admin")).cookie;
  cookieSup = (await login("sup@test.co", "password")).cookie;
});

/** Fecha local más reciente, con al menos `minDias` días de antigüedad, que es domingo, o de lunes a viernes. */
function diaAtras(domingo: boolean, minDias = 2): string {
  for (let d = minDias; d < minDias + 8; d++) {
    const f = sumarDias(fechaLocal(new Date()), -d);
    const ds = diaSemana(f);
    if (domingo ? ds === 0 : ds >= 1 && ds <= 5) return f;
  }
  throw new Error("sin fecha");
}

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

  it("cierra con la hora del horario los turnos sin salida vencidos; sin referencia van a revisión", async () => {
    const { id } = await crearEmpleado();
    // Sin horario asignado: jornada legal de 7 h de lunes a sábado; el domingo no hay referencia.
    const [laborable, domingo] = [diaAtras(false), diaAtras(true)];
    const otro = await crearEmpleado({ identificacion: "1002" });
    await api("POST", "/api/marcaciones", { empleadoId: otro.id, entrada: desdeLocal(domingo, "08:00").toISOString(), motivo: "Prueba de vencimiento" });
    await api("POST", "/api/marcaciones", { empleadoId: id, entrada: desdeLocal(laborable, "08:00").toISOString(), motivo: "Prueba de vencimiento" });
    expect(await app.ctx.marcaciones.cerrarVencidas()).toEqual({ cerradas: 1, aRevision: 1 });
    expect(await app.ctx.marcaciones.cerrarVencidas()).toEqual({ cerradas: 0, aRevision: 0 });

    expect((await api("GET", "/api/marcaciones?estado=REVISION")).json().total).toBe(1);
    const auto = (await api("GET", "/api/marcaciones?salidaAutomatica=true&desde=2020-01-01&hasta=2100-01-01")).json();
    expect(auto.total).toBe(1);
    expect(auto.datos[0]).toMatchObject({ estado: "CERRADA", salidaAutomatica: true, minutosTotales: 7 * 60, minutosExtra: 0 });
    expect(auto.datos[0].salida).toBe(desdeLocal(laborable, "15:00").toISOString());
    expect(auto.datos[0].observacion).toContain("Salida automática a las 15:00");

    // Si el supervisor corrige la hora, deja de ser una salida automática
    const corregida = await api("PATCH", `/api/marcaciones/${auto.datos[0].id}`, { salida: desdeLocal(laborable, "16:30").toISOString(), motivo: "Salió más tarde, confirmado" });
    expect(corregida.json()).toMatchObject({ salidaAutomatica: false, minutosExtra: 90 });
    const det = (await api("GET", `/api/marcaciones/${auto.datos[0].id}`)).json();
    expect(det.historial.map((h: { accion: string }) => h.accion)).toEqual(["EDITAR", "CIERRE_AUTOMATICO", "CREAR"]);
  });

  it("un turno normal alterna entrada y salida; pasadas 16 h se cierra solo y la marcación es una entrada nueva", async () => {
    const horario = (await api("POST", "/api/horarios", {
      nombre: "Oficina",
      tipo: "FIJO",
      dias: [0, 1, 2, 3, 4, 5, 6].map((d) => (d >= 1 && d <= 5 ? { laborable: true, inicio: "08:00", fin: "17:00" } : { laborable: false })),
      descanso: { tipo: "VENTANA", inicio: "12:00", fin: "13:00" },
      toleranciaMinutos: 0,
      requiereAprobacion: false,
    })).json();
    await crearEmpleado({ horarioId: horario.id });
    // Marcas con su hora, como llegan del kiosko sin conexión. D es un día de lunes a viernes.
    const D = diaAtras(false, 4);
    const a = (h: string, dias = 0) => desdeLocal(sumarDias(D, dias), h);
    const svc = app.ctx.marcaciones;
    const cerradas = async () => (await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2100-01-01&estado=CERRADA")).json();

    // Turno normal: entrada y, 12 h después, salida con la hora real
    expect((await svc.marcar("1001", { momento: a("08:00"), offline: true })).tipo).toBe("ENTRADA");
    expect(await svc.situacionAbierta(db, { horarioId: horario.id }, { entrada: a("08:00") }, a("20:00"))).toMatchObject({ vencida: false });
    const salida = await svc.marcar("1001", { momento: a("20:00"), offline: true });
    expect(salida.tipo).toBe("SALIDA");
    expect(salida.aviso).toBeUndefined();
    expect((await cerradas()).datos[0]).toMatchObject({ salidaAutomatica: false, minutosTotales: 11 * 60 });

    // Olvida la salida: 18 h después vuelve a marcar. El turno se cierra a las 17:00 del horario y entra de nuevo
    const D1 = sumarDias(D, 1);
    const laborable = diaSemana(D1) >= 1 && diaSemana(D1) <= 5;
    await svc.marcar("1001", { momento: a("08:00", 1), offline: true });
    const sit = await svc.situacionAbierta(db, { horarioId: horario.id }, { entrada: a("08:00", 1) }, a("02:00", 2));
    expect(sit.vencida).toBe(true);
    expect(sit.salidaProgramada?.toISOString() ?? null).toBe(laborable ? a("17:00", 1).toISOString() : null);
    const nueva = await svc.marcar("1001", { momento: a("02:00", 2), offline: true });
    expect(nueva.tipo).toBe("ENTRADA");
    const lista = (await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2100-01-01")).json();
    expect(lista.total).toBe(3);
    const olvidado = lista.datos.find((m: { entrada: string }) => m.entrada === a("08:00", 1).toISOString());
    if (laborable) {
      expect(nueva.aviso).toContain("17:00");
      expect(olvidado).toMatchObject({ estado: "CERRADA", salidaAutomatica: true, minutosTotales: 8 * 60, minutosExtra: 0 });
      expect(olvidado.salida).toBe(a("17:00", 1).toISOString());
    } else {
      // Sábado: el horario no da una hora de salida y el turno queda por revisar
      expect(olvidado).toMatchObject({ estado: "REVISION", salida: null, salidaAutomatica: false });
    }
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

    // Filtro por empleado: el reporte y el CSV traen solo al seleccionado
    const otro = await crearEmpleado({ identificacion: "1002" });
    await api("POST", "/api/marcaciones", {
      empleadoId: otro.id,
      entrada: desdeLocal("2026-11-05", "08:00").toISOString(),
      salida: desdeLocal("2026-11-05", "19:00").toISOString(),
      motivo: "Turno del segundo empleado",
    });
    const todos = (await api("GET", "/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30")).json();
    expect(todos.datos).toHaveLength(2);
    const solo = (await api("GET", `/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30&empleadoId=${otro.id}`)).json();
    expect(solo.datos.map((f: { identificacion: string }) => f.identificacion)).toEqual(["1002"]);
    expect(solo.totales.minutosExtra).toBe(todos.totales.minutosExtra - 60);
    const csvSolo = await api("GET", `/api/reportes/liquidacion?desde=2026-11-01&hasta=2026-11-30&empleadoId=${otro.id}&formato=csv`);
    expect(csvSolo.body.trim().split("\r\n")).toHaveLength(2);
    expect(csvSolo.body).toContain("1002");
    expect(csvSolo.headers["content-disposition"]).toContain("liquidacion_1002_2026-11-01_2026-11-30.csv");
    await api("POST", `/api/marcaciones/${(await api("GET", `/api/marcaciones?empleadoId=${otro.id}`)).json().datos[0].id}/anular`, { motivo: "Limpieza de la prueba" });

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

  it("una salida recibida tarde sustituye al cierre automático del turno", async () => {
    const { id } = await crearEmpleado();
    const dia = diaAtras(false);
    await api("POST", "/api/marcaciones", { empleadoId: id, entrada: desdeLocal(dia, "08:00").toISOString(), motivo: "Entrada de prueba" });
    expect(await app.ctx.marcaciones.cerrarVencidas()).toEqual({ cerradas: 1, aRevision: 0 });
    // La tablet guardó la salida real (17:00) y la envía días después
    const r = (await sincronizar([{ id: uuid(), codigo: "1001", capturadoEn: desdeLocal(dia, "17:00").toISOString() }])).json();
    expect(r.resultados[0]).toMatchObject({ estado: "APLICADA", tipo: "SALIDA" });
    const lista = (await api("GET", "/api/marcaciones?desde=2020-01-01&hasta=2100-01-01")).json();
    expect(lista.total).toBe(1);
    expect(lista.datos[0]).toMatchObject({ estado: "CERRADA", salidaAutomatica: false, minutosTotales: 9 * 60, minutosExtra: 120 });
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

describe("cierre de periodos liquidados", () => {
  const P = { desde: "2026-10-01", hasta: "2026-10-15" };
  const reporte = async (hasta = P.hasta, extra = "") => api("GET", `/api/reportes/liquidacion?desde=${P.desde}&hasta=${hasta}${extra}`);

  it("avisa de los turnos por revisar, cierra, deja el periodo en solo consulta y permite reabrir con motivo", async () => {
    const { id } = await crearEmpleado();
    const cerrado = (await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: desdeLocal("2026-10-05", "08:00").toISOString(),
      salida: desdeLocal("2026-10-05", "18:00").toISOString(),
      motivo: "Turno normal con extras",
    })).json();
    const sinSalida = (await api("POST", "/api/marcaciones", {
      empleadoId: id,
      entrada: desdeLocal("2026-10-06", "08:00").toISOString(),
      motivo: "Olvidó marcar la salida",
    })).json();
    // Un turno que quedó por revisar (p. ej. sin hora de referencia en el horario)
    await db.execute(sql`update marcaciones set estado = 'REVISION' where id = ${sinSalida.id}`);

    // El reporte y el CSV señalan el turno que no está incluido
    const rep = (await reporte()).json();
    expect(rep.pendientes).toMatchObject({ porRevisar: 1, enTurno: 0, extrasPorAprobar: 0, total: 1 });
    expect(rep.datos[0]).toMatchObject({ turnos: 1, turnosPorRevisar: 1 });
    expect(rep.cierre.estado).toBe("ABIERTO");
    const csv = (await reporte(P.hasta, "&formato=csv")).body.split("\r\n");
    const col = csv[0]!.split(";").indexOf("Turnos por revisar (no incluidos)");
    expect(csv[1]!.split(";")[col]).toBe("1");

    // Solo un administrador cierra, y no con pendientes ni con el periodo sin terminar
    expect((await api("POST", "/api/periodos", P, cookieSup)).statusCode).toBe(403);
    const conPendientes = await api("POST", "/api/periodos", P);
    expect(conPendientes.statusCode).toBe(409);
    expect(conPendientes.json().codigo).toBe("PERIODO_CON_PENDIENTES");
    expect((await api("POST", "/api/periodos", { desde: "2026-10-01", hasta: "2100-01-01" })).statusCode).toBe(400);

    await api("PATCH", `/api/marcaciones/${sinSalida.id}`, { salida: desdeLocal("2026-10-06", "15:00").toISOString(), motivo: "Salida confirmada por el jefe" });
    const cierre = await api("POST", "/api/periodos", { ...P, nota: "Nómina primera quincena" });
    expect(cierre.statusCode).toBe(201);
    expect(cierre.json().resumen).toMatchObject({ empleados: 1, turnos: 2, valorTotal: 37_500 });
    expect(cierre.json().detalle).toHaveLength(1);

    // Solo consulta: nada del periodo se puede crear, corregir, anular ni recalcular
    const bloqueos = [
      await api("POST", "/api/marcaciones", { empleadoId: id, entrada: desdeLocal("2026-10-07", "08:00").toISOString(), salida: desdeLocal("2026-10-07", "12:00").toISOString(), motivo: "Turno olvidado" }),
      await api("PATCH", `/api/marcaciones/${cerrado.id}`, { salida: desdeLocal("2026-10-05", "20:00").toISOString(), motivo: "Corrección tardía" }),
      await api("POST", `/api/marcaciones/${cerrado.id}/anular`, { motivo: "Anulación tardía" }),
    ];
    for (const b of bloqueos) {
      expect(b.statusCode).toBe(409);
      expect(b.json().codigo).toBe("PERIODO_LIQUIDADO");
    }
    // Tampoco se puede mover hacia el periodo liquidado un turno de fuera
    const fuera = (await api("POST", "/api/marcaciones", { empleadoId: id, entrada: desdeLocal("2026-10-19", "08:00").toISOString(), salida: desdeLocal("2026-10-19", "12:00").toISOString(), motivo: "Turno posterior" })).json();
    const mover = await api("PATCH", `/api/marcaciones/${fuera.id}`, { entrada: desdeLocal("2026-10-14", "08:00").toISOString(), salida: desdeLocal("2026-10-14", "12:00").toISOString(), motivo: "Fecha equivocada" });
    expect(mover.json().codigo).toBe("PERIODO_LIQUIDADO");
    // Un cambio de salario no altera lo ya liquidado
    await api("PUT", `/api/empleados/${id}`, { identificacion: "1001", nombre: "Laura", apellido: "Gómez", salario: 4_200_000, horarioId: null, motivo: "Aumento posterior al cierre" });
    const recalculo = (await api("POST", "/api/marcaciones/recalcular", { desde: "2026-10-01", hasta: "2026-10-31" })).json();
    expect(recalculo).toEqual({ diasRecalculados: 1, diasOmitidosPorLiquidados: 2 });
    expect((await reporte()).json().totales.valorTotal).toBe(37_500);

    // Volver a elegir días ya liquidados: no se puede cerrar de nuevo ni descargar un rango mezclado
    const solape = await api("POST", "/api/periodos", { desde: "2026-10-10", hasta: "2026-10-20" });
    expect(solape.json().codigo).toBe("PERIODO_SOLAPADO");
    expect((await reporte()).json().cierre.estado).toBe("LIQUIDADO");
    expect((await reporte("2026-10-20")).json().cierre.estado).toBe("MIXTO");
    expect((await reporte("2026-10-20", "&formato=csv")).json().codigo).toBe("PERIODO_MIXTO");
    expect((await reporte(P.hasta, "&formato=csv")).body).toContain("Liquidado");

    // Reabrir exige motivo y deja historial; al volver a cerrar hay dos liquidaciones del mismo periodo
    const pid = cierre.json().id;
    expect((await api("POST", `/api/periodos/${pid}/reabrir`, { motivo: "" })).statusCode).toBe(400);
    expect((await api("POST", `/api/periodos/${pid}/reabrir`, { motivo: "Faltó registrar horas extra del día 5" }, cookieSup)).statusCode).toBe(403);
    expect((await api("POST", `/api/periodos/${pid}/reabrir`, { motivo: "Faltó registrar horas extra del día 5" })).statusCode).toBe(200);
    expect((await api("POST", `/api/periodos/${pid}/reabrir`, { motivo: "Segunda vez, no debe dejar" })).statusCode).toBe(409);
    const corregir = await api("PATCH", `/api/marcaciones/${cerrado.id}`, { salida: desdeLocal("2026-10-05", "19:00").toISOString(), motivo: "Salió una hora más tarde" });
    expect(corregir.statusCode).toBe(200);
    const segundo = await api("POST", "/api/periodos", P);
    expect(segundo.statusCode).toBe(201);
    expect(segundo.json().resumen.valorTotal).toBeGreaterThan(37_500);

    const historial = (await api("GET", "/api/periodos", undefined, cookieSup)).json().datos;
    expect(historial).toHaveLength(2);
    const anterior = historial.find((h: { id: number }) => h.id === pid);
    expect(anterior).toMatchObject({ vigente: false, motivoReapertura: "Faltó registrar horas extra del día 5", reabiertoPorNombre: "Admin", cerradoPorNombre: "Admin" });
    expect(anterior.resumen.valorTotal).toBe(37_500);
    expect(historial.filter((h: { vigente: boolean }) => h.vigente)).toHaveLength(1);

    const audit = await db.execute(sql`select accion from auditoria where entidad = 'periodo' order by id`);
    expect(audit.map((a) => a.accion)).toEqual(["CERRAR_PERIODO", "REABRIR_PERIODO", "CERRAR_PERIODO"]);
  });
});
