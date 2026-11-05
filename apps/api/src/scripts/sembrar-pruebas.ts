/**
 * Crea empleados ficticios para probar el kiosko, el panel y la liquidación.
 * Es idempotente: si el documento ya existe, no lo toca.
 * Uso: npm run sembrar-pruebas -w @inout/api
 *
 * Documentos cortos (1001…1006) para teclearlos rápido en el kiosko.
 * Salario mínimo 2026: 1.750.905 (Decreto 1469 de 2025).
 */
import { auditar } from '../rutas/comun.js';
import { config } from '../config.js';
import { db, pool } from '../db/index.js';
import { empleados } from '../db/schema.js';

if (config.NODE_ENV === 'production') {
  console.error('sembrar-pruebas no se ejecuta en producción.');
  process.exit(1);
}

const SMMLV_2026 = 1_750_905;

const PRUEBAS: (typeof empleados.$inferInsert & { caso: string })[] = [
  { documento: '1001', nombre: 'Laura Gómez (prueba)', salarioMensual: SMMLV_2026, jornadaPactadaMin: null, caso: 'Diurna de lunes a sábado, jornada legal (42 h ÷ 6 = 7 h)' },
  { documento: '1002', nombre: 'Andrés Rojas (prueba)', salarioMensual: 1_900_000, jornadaPactadaMin: 480, caso: 'Turno nocturno, jornada pactada de 8 h' },
  { documento: '1003', nombre: 'Marta Díaz (prueba)', salarioMensual: SMMLV_2026, jornadaPactadaMin: null, caso: 'Trabaja domingos y festivos' },
  { documento: '1004', nombre: 'Julián Pérez (prueba)', salarioMensual: 875_453, jornadaPactadaMin: 240, caso: 'Medio tiempo, 4 h pactadas: extras desde la hora 5' },
  { documento: '1005', nombre: 'Sofía Herrera (prueba)', salarioMensual: 3_200_000, jornadaPactadaMin: null, caso: 'Salario alto, para comparar valores y alertas de extras' },
  { documento: '1006', nombre: 'Pedro Castro (prueba, inactivo)', salarioMensual: SMMLV_2026, jornadaPactadaMin: null, activo: false, caso: 'Inactivo: el kiosko debe rechazarlo' },
];

try {
  for (const { caso, ...datos } of PRUEBAS) {
    const creado = await db.transaction(async (tx) => {
      const [e] = await tx.insert(empleados).values(datos).onConflictDoNothing().returning();
      if (e) await auditar(tx, { tabla: 'empleados', registroId: e.id, usuarioId: null, motivo: 'Empleado de prueba (sembrar-pruebas)', antes: null, despues: datos });
      return e;
    });
    console.log(`${creado ? 'creado ' : 'ya existía'}  ${datos.documento}  ${datos.nombre.padEnd(32)} ${caso}`);
  }
} finally {
  await pool.end();
}
