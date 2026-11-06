import { zonaHoraria } from "@inout/core";
import { sql } from "drizzle-orm";

/**
 * Zona horaria configurada como literal SQL, para `... at time zone ${zonaSql()}`.
 * Va como literal (no como parámetro) para que la misma expresión pueda repetirse en
 * SELECT y GROUP BY. Es seguro: establecerZona solo acepta nombres IANA válidos, sin comillas.
 */
export const zonaSql = () => sql.raw(`'${zonaHoraria()}'`);
