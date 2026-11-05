/**
 * Migración de datos desde la base de Laravel (InOut 1) a InOut 2.
 *
 * Laravel guardaba `registros_horarios.entrada/salida` como `timestamp` SIN zona,
 * en la zona de `config('app.timezone')`:
 *   - hasta abr-2026: la variable APP_TIMEZONE del .env de producción (por defecto UTC);
 *   - desde el despliegue del commit 372b7dd (6-abr-2026): 'Europe/Madrid' fijo.
 * Por eso la zona de origen se indica por periodos (--tz y --tz-desde).
 *
 * Uso (desde apps/api):
 *   npm run migrar-laravel -- --origen postgres://…/laravel --analizar
 *   npm run migrar-laravel -- --origen … --tz UTC --tz-desde 2026-04-07=Europe/Madrid            (simulación)
 *   npm run migrar-laravel -- --origen … --tz UTC --tz-desde 2026-04-07=Europe/Madrid --ejecutar (escribe)
 *
 * Destino: DATABASE_URL. Debe estar vacío (sin empleados ni marcaciones).
 */
import { parseArgs } from 'node:util';
import { fechaLocal, horaLocal } from '@inout/core';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { config } from '../config.js';
import { db, pool } from '../db/index.js';
import { empleados, marcaciones } from '../db/schema.js';
import { auditar } from '../rutas/comun.js';

const { values: args } = parseArgs({
  options: {
    origen: { type: 'string' },
    tz: { type: 'string' },
    'tz-desde': { type: 'string', multiple: true, default: [] },
    analizar: { type: 'boolean', default: false },
    ejecutar: { type: 'boolean', default: false },
  },
});

function salir(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!args.origen) salir('Falta --origen <url de la base de Laravel>');
const origen = new pg.Pool({ connectionString: args.origen, options: '-c TimeZone=UTC' });

/** Comprueba que la zona exista en PostgreSQL (evita errores tipográficos). */
async function validarZona(zona: string) {
  const r = await origen.query('select 1 from pg_timezone_names where name = $1', [zona]);
  if (!r.rowCount) salir(`Zona horaria desconocida: ${zona}`);
}

// --- Modo análisis -----------------------------------------------------------

const CANDIDATAS = ['UTC', 'Europe/Madrid', 'America/Bogota'];

async function analizar() {
  const { rows: resumen } = await origen.query(`
    select count(*)::int total, min(entrada)::text primera, max(entrada)::text ultima,
           count(*) filter (where entrada < '2026-04-06')::int antes_abr26,
           count(*) filter (where entrada >= '2026-04-06')::int desde_abr26
    from registros_horarios`);
  console.log('registros_horarios:', resumen[0]);
  const viejos = await origen.query(`select count(*)::int n from information_schema.tables where table_name = 'registros'`);
  if (viejos.rows[0].n) {
    const n = await origen.query('select count(*)::int n from registros');
    console.log(`Tabla antigua "registros": ${n.rows[0].n} filas (no se migra; revisar si tiene datos que no estén en registros_horarios).`);
  }

  for (const [titulo, filtro] of [
    ['ANTES del 6-abr-2026', `entrada < '2026-04-06'`],
    ['DESDE el 6-abr-2026', `entrada >= '2026-04-06'`],
  ] as const) {
    const cols = CANDIDATAS.map(
      (z, i) => `count(*) filter (where extract(hour from (entrada at time zone $${i + 1}) at time zone 'America/Bogota') = h)::int as "${z}"`,
    ).join(', ');
    const { rows } = await origen.query(
      `select h, ${cols} from generate_series(0, 23) h cross join (select entrada from registros_horarios where ${filtro}) r group by h order by h`,
      CANDIDATAS,
    );
    const total = rows.reduce((s, r) => s + r.UTC, 0);
    console.log(`\nEntradas ${titulo} (${total}): hora de Colombia resultante según la zona de origen supuesta`);
    console.log('hora Col. | ' + CANDIDATAS.map((z) => z.padStart(14)).join(' | '));
    for (const r of rows) {
      if (!CANDIDATAS.some((z) => r[z] > 0)) continue;
      console.log(`  ${String(r.h).padStart(2, '0')}:00   | ` + CANDIDATAS.map((z) => String(r[z] || '').padStart(14)).join(' | '));
    }
  }
  console.log('\nLa zona correcta es la columna cuyo pico coincide con la hora real de llegada del personal en Colombia.');
}

// --- Migración ---------------------------------------------------------------

interface Tramo {
  desde: string;
  zona: string;
}

function tramosDeZona(): Tramo[] {
  if (!args.tz) salir('Falta --tz <zona de origen> (p. ej. UTC). Ejecuta antes --analizar.');
  const tramos: Tramo[] = [{ desde: '0001-01-01', zona: args.tz }];
  for (const t of args['tz-desde']) {
    const m = /^(\d{4}-\d{2}-\d{2})=(.+)$/.exec(t);
    if (!m) salir(`--tz-desde inválido: ${t} (formato YYYY-MM-DD=Zona)`);
    tramos.push({ desde: m[1]!, zona: m[2]! });
  }
  return tramos.sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Expresión SQL que convierte una columna naive a timestamptz según el tramo. */
function conversion(col: string, tramos: Tramo[], params: string[]): string {
  const p = (v: string) => {
    params.push(v);
    return `$${params.length}`;
  };
  const casos = [...tramos]
    .reverse()
    .map((t) => `when ${col} >= ${p(t.desde)}::timestamp then ${col} at time zone ${p(t.zona)}`)
    .join(' ');
  return `case ${casos} end`;
}

// Marcas que Laravel dejaba en `novedad` cuando inventaba datos.
const SALIDA_INVENTADA = /salida asignada autom/i;
const ENTRADA_INVENTADA = /entrada nula|entrada asignada autom/i;
// Laravel añadía esto cuando un usuario editaba el registro: los valores ya los revisó una persona.
const EDITADO_POR_USUARIO = /cambios realizados/i;

async function migrar() {
  const tramos = tramosDeZona();
  for (const t of tramos) await validarZona(t.zona);
  console.log('Zonas de origen:', tramos.map((t) => `${t.desde} → ${t.zona}`).join(', '));

  const params: string[] = [];
  const { rows: regs } = await origen.query(
    `select r.id, r.empleado_id, ${conversion('r.entrada', tramos, params)} as entrada,
            ${conversion('r.salida', tramos, params)} as salida, r.entrada::text as entrada_orig,
            r.salida::text as salida_orig, r.estado, r.novedad
     from registros_horarios r order by r.entrada`,
    params,
  );
  const { rows: emps } = await origen.query(`select * from empleados order by id`);

  await migrate(db, { migrationsFolder: config.MIGRATIONS_DIR });
  const [{ n }] = (await db.execute(sql`select (select count(*) from empleados) + (select count(*) from marcaciones) as n`)).rows as [{ n: string }];
  if (Number(n) > 0) salir('El destino ya tiene empleados o marcaciones. La migración solo se hace sobre una base vacía.');

  const avisos: string[] = [];
  const cuenta = { empleados: 0, CERRADA: 0, ABIERTA: 0, REVISION: 0, salidasInventadas: 0, entradasInventadas: 0, sinEmpleado: 0 };
  const ahora = new Date();
  const maxMs = config.MAX_HORAS_TURNO * 3_600_000;

  try {
    await db.transaction(async (tx) => {
      const mapa = new Map<number, number>();
      for (const e of emps) {
        const doc = String(e.identificacion ?? '').replace(/\D/g, '');
        const documento = doc.length >= 3 ? doc : `L${e.id}`;
        if (documento.startsWith('L')) avisos.push(`Empleado ${e.id} (${e.nombre}) sin identificación válida: documento provisional ${documento}`);
        const salario = Math.round(Number(e.salario ?? 0));
        if (salario <= 0) avisos.push(`Empleado ${e.id} (${e.nombre}) sin salario: se registra 1 y hay que corregirlo antes de liquidar`);
        const [nuevo] = await tx
          .insert(empleados)
          .values({
            documento,
            nombre: [e.nombre, e.apellido].filter(Boolean).join(' ').trim(),
            salarioMensual: Math.max(salario, 1),
            jornadaPactadaMin: null, // Laravel guardaba horasxsemana=44 por defecto: se aplica la jornada legal vigente.
            activo: (e.estado ?? 'activo').toLowerCase() === 'activo',
          })
          .returning({ id: empleados.id });
        mapa.set(e.id, nuevo!.id);
        cuenta.empleados++;
      }

      // Último registro sin salida por empleado: candidato a seguir ABIERTO.
      const ultimoAbierto = new Map<number, number>();
      for (const r of regs) if (!r.salida) ultimoAbierto.set(r.empleado_id, r.id);

      for (const r of regs) {
        const empleadoId = mapa.get(r.empleado_id);
        if (!empleadoId) {
          cuenta.sinEmpleado++;
          avisos.push(`Registro ${r.id}: empleado ${r.empleado_id} no existe; se omite`);
          continue;
        }
        const novedad = String(r.novedad ?? '');
        let entrada: Date = r.entrada;
        let salida: Date | null = r.salida;
        let estado: 'ABIERTA' | 'CERRADA' | 'REVISION';
        let motivo = `Migrado de Laravel (registro ${r.id}, estado "${r.estado}"; original ${r.entrada_orig} → ${r.salida_orig ?? 'sin salida'})`;

        const revisadoPorPersona = EDITADO_POR_USUARIO.test(novedad);
        if (revisadoPorPersona && salida && salida > entrada) {
          estado = 'CERRADA';
          motivo += '. Editado por un usuario en Laravel: se respetan sus valores';
        } else if (SALIDA_INVENTADA.test(novedad) || /autom/i.test(String(r.estado))) {
          // Laravel puso salida 18:00 del día en que corrió el comando: no es real.
          salida = null;
          estado = 'REVISION';
          cuenta.salidasInventadas++;
          motivo += '. Salida inventada por Laravel descartada';
        } else if (ENTRADA_INVENTADA.test(novedad)) {
          // Entrada = salida − 1 h inventada; la salida sí es real. Se conserva para que el supervisor decida.
          estado = 'REVISION';
          cuenta.entradasInventadas++;
          motivo += '. Entrada inventada por Laravel (1 h antes): requiere confirmación';
        } else if (salida) {
          estado = salida > entrada ? 'CERRADA' : 'REVISION';
          if (estado === 'REVISION') motivo += '. Salida anterior a la entrada';
        } else {
          const reciente = ahora.getTime() - entrada.getTime() <= maxMs;
          estado = reciente && ultimoAbierto.get(r.empleado_id) === r.id ? 'ABIERTA' : 'REVISION';
        }
        if (salida && salida.getTime() - entrada.getTime() > 24 * 3_600_000 && estado === 'CERRADA') {
          estado = 'REVISION';
          motivo += '. Turno de más de 24 h';
        }
        cuenta[estado]++;

        const [m] = await tx.insert(marcaciones).values({ empleadoId, entrada, salida, estado }).returning({ id: marcaciones.id });
        await auditar(tx, {
          tabla: 'marcaciones',
          registroId: m!.id,
          usuarioId: null,
          motivo,
          antes: { laravel: { id: r.id, entrada: r.entrada_orig, salida: r.salida_orig, estado: r.estado, novedad: r.novedad } },
          despues: { estado, entrada: entrada.toISOString(), salida: salida?.toISOString() ?? null },
        });
      }

      console.log('\nResultado:', cuenta);
      const muestra = regs.slice(-5).map((r) => `  Laravel ${r.entrada_orig} → Colombia ${fechaLocal(r.entrada)} ${horaLocal(r.entrada)}`);
      console.log('Muestra de conversión (últimos 5):\n' + muestra.join('\n'));
      if (avisos.length) console.log(`\nAvisos (${avisos.length}):\n  ` + avisos.slice(0, 50).join('\n  '));
      if (!args.ejecutar) throw new Simulacion();
    });
    console.log('\nMigración ESCRITA en el destino.');
  } catch (err) {
    if (err instanceof Simulacion) console.log('\nSIMULACIÓN: no se escribió nada. Añade --ejecutar para migrar.');
    else throw err;
  }
}

class Simulacion extends Error {}

try {
  if (args.analizar) await analizar();
  else await migrar();
} finally {
  await origen.end();
  await pool.end();
}
