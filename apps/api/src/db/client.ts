import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function crearDb(url: string) {
  const cliente = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(cliente, { schema });
  return { db, cliente };
}

export type Db = ReturnType<typeof crearDb>["db"];
/** Transacción o conexión: ambos exponen la misma API de consultas. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
