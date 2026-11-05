import { and, desc, eq, lt, ne } from 'drizzle-orm';
import { config } from './config.js';
import type { Db } from './db/index.js';
import { auditoria, empleados, marcaciones } from './db/schema.js';

const MS_HORA = 3_600_000;

export type ResultadoMarcacion =
  | { ok: true; tipo: 'ENTRADA' | 'SALIDA'; empleado: string; instante: Date; aviso?: string }
  | { ok: false; codigo: 'NO_ENCONTRADO' | 'DUPLICADA'; mensaje: string };

/**
 * Registra una marcación desde el kiosko. Alterna entrada/salida.
 * - Antirrebote: ignora una segunda marcación dentro de ANTIRREBOTE_SEGUNDOS.
 * - Si la marcación abierta supera MAX_HORAS_TURNO, pasa a REVISION (no se
 *   inventa la salida) y esta marcación abre un turno nuevo.
 * El instante se guarda tal cual (UTC); no se aplica ninguna zona aquí.
 */
export async function marcar(db: Db, documento: string, ahora = new Date()): Promise<ResultadoMarcacion> {
  return db.transaction(async (tx) => {
    // Bloquea la fila del empleado para serializar marcaciones simultáneas.
    const [emp] = await tx
      .select()
      .from(empleados)
      .where(and(eq(empleados.documento, documento), eq(empleados.activo, true)))
      .for('update');
    if (!emp) return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Documento no registrado' } as const;

    const [ultima] = await tx
      .select()
      .from(marcaciones)
      .where(and(eq(marcaciones.empleadoId, emp.id), ne(marcaciones.estado, 'ANULADA')))
      .orderBy(desc(marcaciones.entrada))
      .limit(1);

    if (ultima) {
      const ultimoEvento = ultima.salida ?? ultima.entrada;
      if (ahora.getTime() - ultimoEvento.getTime() < config.ANTIRREBOTE_SEGUNDOS * 1000) {
        return { ok: false, codigo: 'DUPLICADA', mensaje: 'Ya registraste una marcación hace un momento' } as const;
      }
    }

    let aviso: string | undefined;
    if (ultima?.estado === 'ABIERTA') {
      const vencida = ahora.getTime() - ultima.entrada.getTime() > config.MAX_HORAS_TURNO * MS_HORA;
      if (!vencida) {
        await tx
          .update(marcaciones)
          .set({ salida: ahora, estado: 'CERRADA', actualizadoEn: ahora })
          .where(eq(marcaciones.id, ultima.id));
        return { ok: true, tipo: 'SALIDA', empleado: emp.nombre, instante: ahora } as const;
      }
      await enviarARevision(tx, ultima.id, ahora);
      aviso = 'Tu turno anterior no tenía salida y quedó en revisión';
    }

    await tx.insert(marcaciones).values({ empleadoId: emp.id, entrada: ahora, actualizadoEn: ahora });
    return { ok: true, tipo: 'ENTRADA', empleado: emp.nombre, instante: ahora, aviso } as const;
  });
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function enviarARevision(tx: Tx | Db, id: number, ahora: Date) {
  await tx.update(marcaciones).set({ estado: 'REVISION', actualizadoEn: ahora }).where(eq(marcaciones.id, id));
  await tx.insert(auditoria).values({
    tabla: 'marcaciones',
    registroId: id,
    usuarioId: null,
    motivo: `Sin salida tras ${config.MAX_HORAS_TURNO} h`,
    antes: { estado: 'ABIERTA' },
    despues: { estado: 'REVISION' },
  });
}

/** Tarea periódica: pasa a REVISION los turnos abiertos que superan el máximo. */
export async function revisarVencidas(db: Db, ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - config.MAX_HORAS_TURNO * MS_HORA);
  const vencidas = await db
    .select({ id: marcaciones.id })
    .from(marcaciones)
    .where(and(eq(marcaciones.estado, 'ABIERTA'), lt(marcaciones.entrada, limite)));
  for (const { id } of vencidas) {
    await db.transaction((tx) => enviarARevision(tx, id, ahora));
  }
  return vencidas.length;
}
