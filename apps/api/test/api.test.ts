import { desdeLocal } from "@inout/core";
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
  await db.execute(sql`truncate auditoria, liquidacion_lineas, marcaciones, empleados, usuarios, festivos_ajustes restart identity cascade`);
  await db.insert(usuarios).values([
    { nombre: "Admin", email: "admin@test.co", passwordHash: await hashPassword("clave-admin"), rol: "ADMIN" },
    // Hash generado por Laravel (bcrypt $2y$) para "password"
    { nombre: "Sup", email: "sup@test.co", passwordHash: "$2y$10$kl5AtKA6uXoPVNecpNa25.cHX1kwcLEZ1GtuoKvofXLOb5Oo0i2cu", rol: "SUPERVISOR" },
  ]);
  cookieAdmin = (await login("admin@test.co", "clave-admin")).cookie;
  cookieSup = (await login("sup@test.co", "password")).cookie;
});

async function crearEmpleado(datos: Partial<{ identificacion: string; salario: number }> = {}) {
  const r = await api("POST", "/api/empleados", {
    identificacion: datos.identificacion ?? "1001",
    nombre: "Laura",
    apellido: "Gómez",
    salario: datos.salario ?? 2_100_000,
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

  it("responde 404 con códigos desconocidos y rechaza marcaciones offline antiguas", async () => {
    await crearEmpleado();
    expect((await app.inject({ method: "POST", url: "/api/kiosko/marcar", payload: { codigo: "999" } })).statusCode).toBe(404);
    const vieja = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const r = await app.inject({ method: "POST", url: "/api/kiosko/marcar", payload: { codigo: "1001", capturadoEn: vieja } });
    expect(r.statusCode).toBe(400);
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
    await api("POST", "/api/config/festivos/ajustes", { fecha: "2026-11-04", tipo: "AGREGAR", descripcion: "Día cívico" });
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
