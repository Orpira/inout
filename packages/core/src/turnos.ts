import { parametrosEn } from './parametros.js';
import { type FechaLocal, desdeLocal, diaSemanaDeFecha, lunesDeSemana, sumarDias } from './zona.js';

/**
 * Turnos y horarios fijos.
 *
 * Cada empleado tiene un horario fijo: qué turno hace cada día de la semana
 * (o si descansa). Cambia ocasionalmente, por eso se versiona con una fecha
 * de vigencia y rige la última versión con `vigenteDesde <= fecha`.
 *
 * Un turno es un horario en hora de Colombia ('HH:MM'). Si la hora de fin es
 * menor o igual que la de inicio, el turno termina al día siguiente. El
 * descanso intermedio (almuerzo, CST art. 167) no es tiempo de trabajo.
 *
 * Reglas legales que se validan al programar (CST art. 161, mod. Ley 2101/2021
 * y Ley 2466/2025):
 * - Semana: no más horas ordinarias que la jornada máxima vigente (42 h desde
 *   el 15-jul-2026) y al menos un día de descanso.
 * - Día: máximo 9 h ordinarias (jornada flexible, lit. a). Más de 8 h solo con
 *   pacto escrito de jornada flexible: se avisa, no se bloquea.
 * - Un solo turno por persona y día (parágrafo 1.º).
 */
export interface HorarioTurno {
  horaInicio: string;
  horaFin: string;
  descansoInicio?: string | null;
  descansoFin?: string | null;
}

export interface VentanasTurno {
  inicio: Date;
  fin: Date;
  descanso: { inicio: Date; fin: Date } | null;
  /** Minutos ordinarios del turno: duración menos descanso. */
  ordinariaMin: number;
}

export const MAX_ORDINARIA_DIA_MIN = 9 * 60;
export const MAX_ORDINARIA_DIA_SIN_FLEXIBLE_MIN = 8 * 60;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MS_MIN = 60_000;

/** Instante de una hora del turno: si es anterior a la de inicio, cae al día siguiente. */
function instanteDelTurno(fecha: FechaLocal, horaInicio: string, hora: string, esFin = false): Date {
  const siguiente = esFin ? hora <= horaInicio : hora < horaInicio;
  return desdeLocal(siguiente ? sumarDias(fecha, 1) : fecha, hora);
}

/** Error de formato o de coherencia del horario, o null si es válido. */
export function validarHorario(h: HorarioTurno): string | null {
  if (!HORA.test(h.horaInicio) || !HORA.test(h.horaFin)) return 'Las horas deben tener el formato HH:MM';
  const conDescanso = h.descansoInicio || h.descansoFin;
  if (conDescanso) {
    if (!h.descansoInicio || !h.descansoFin) return 'El descanso necesita hora de inicio y de fin';
    if (!HORA.test(h.descansoInicio) || !HORA.test(h.descansoFin)) return 'Las horas del descanso deben tener el formato HH:MM';
  }
  const v = ventanasTurno('2026-01-05', h, false);
  if (v.descanso && !(v.inicio < v.descanso.inicio && v.descanso.inicio < v.descanso.fin && v.descanso.fin < v.fin))
    return 'El descanso debe quedar dentro del turno';
  if (v.ordinariaMin <= 0) return 'El turno no tiene horas de trabajo';
  if (v.ordinariaMin > MAX_ORDINARIA_DIA_MIN) return 'Un turno no puede pasar de 9 h ordinarias (CST art. 161)';
  return null;
}

export function ventanasTurno(fecha: FechaLocal, h: HorarioTurno, comprobar = true): VentanasTurno {
  if (comprobar) {
    const error = validarHorario(h);
    if (error) throw new Error(`Turno inválido (${h.horaInicio}-${h.horaFin}): ${error}`);
  }
  const inicio = desdeLocal(fecha, h.horaInicio);
  const fin = instanteDelTurno(fecha, h.horaInicio, h.horaFin, true);
  const descanso =
    h.descansoInicio && h.descansoFin
      ? { inicio: instanteDelTurno(fecha, h.horaInicio, h.descansoInicio), fin: instanteDelTurno(fecha, h.horaInicio, h.descansoFin) }
      : null;
  const dur = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_MIN);
  return { inicio, fin, descanso, ordinariaMin: dur(inicio, fin) - (descanso ? dur(descanso.inicio, descanso.fin) : 0) };
}

export interface DiaDeProgramacion {
  fecha: FechaLocal;
  /** null = día de descanso programado. */
  horario: HorarioTurno | null;
}

export interface ResultadoValidacion {
  errores: string[];
  avisos: string[];
}

/**
 * Valida la programación de UN empleado. Agrupa por semana (lunes a domingo).
 * Los días sin programar no cuentan ni como turno ni como descanso.
 */
export function validarProgramacion(dias: DiaDeProgramacion[]): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const semanas = new Map<FechaLocal, { ordinariaMin: number; turnos: number }>();

  for (const d of dias) {
    if (!d.horario) continue;
    const error = validarHorario(d.horario);
    if (error) {
      errores.push(`${d.fecha}: ${error}`);
      continue;
    }
    const { ordinariaMin } = ventanasTurno(d.fecha, d.horario);
    if (ordinariaMin > MAX_ORDINARIA_DIA_SIN_FLEXIBLE_MIN)
      avisos.push(`${d.fecha}: más de 8 h ordinarias, requiere pacto escrito de jornada flexible (CST art. 161 lit. a)`);
    const lunes = lunesDeSemana(d.fecha);
    const s = semanas.get(lunes) ?? { ordinariaMin: 0, turnos: 0 };
    s.ordinariaMin += ordinariaMin;
    s.turnos++;
    semanas.set(lunes, s);
  }

  for (const [lunes, s] of semanas) {
    // La jornada máxima que rige al final de la semana (las reducciones solo bajan).
    const maxHoras = parametrosEn(sumarDias(lunes, 6)).jornadaSemanalHoras;
    if (s.ordinariaMin > maxHoras * 60)
      errores.push(
        `Semana del ${lunes}: ${(s.ordinariaMin / 60).toLocaleString('es-CO')} h ordinarias programadas; el máximo legal es ${maxHoras} h. Lo que exceda es trabajo extra y no se programa como turno.`,
      );
    if (s.turnos >= 7) errores.push(`Semana del ${lunes}: hay que dejar al menos un día de descanso (CST art. 161 y 172)`);
  }
  return { errores, avisos };
}

/** Horario fijo semanal: 7 posiciones, índice 0 = domingo … 6 = sábado; null = descanso. */
export type SemanaTipo = (HorarioTurno | null)[];

export interface VersionHorario {
  vigenteDesde: FechaLocal;
  semana: SemanaTipo;
}

/** Turno (o descanso) de cada fecha del rango según las versiones vigentes. Sin versión vigente: la fecha no aparece. */
export function programacionEntre(versiones: VersionHorario[], desde: FechaLocal, hasta: FechaLocal): Map<FechaLocal, HorarioTurno | null> {
  const ordenadas = [...versiones].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const res = new Map<FechaLocal, HorarioTurno | null>();
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const v = ordenadas.findLast((x) => x.vigenteDesde <= f);
    if (v) res.set(f, v.semana[diaSemanaDeFecha(f)] ?? null);
  }
  return res;
}

/** Valida un horario fijo con las normas vigentes en la semana en que empieza a regir. */
export function validarSemanaTipo(semana: SemanaTipo, vigenteDesde: FechaLocal): ResultadoValidacion {
  if (semana.length !== 7) return { errores: ['El horario debe tener los 7 días de la semana'], avisos: [] };
  const lunes = lunesDeSemana(vigenteDesde);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const r = validarProgramacion(dias.map((fecha) => ({ fecha, horario: semana[diaSemanaDeFecha(fecha)] ?? null })));
  // En un horario fijo los mensajes no van por fecha sino por día de la semana.
  const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const limpiar = (m: string) =>
    m.replace(/^(\d{4}-\d{2}-\d{2}): /, (_, f: string) => `${NOMBRES[diaSemanaDeFecha(f)]}: `).replace(/^Semana del \d{4}-\d{2}-\d{2}: /, '');
  return { errores: r.errores.map(limpiar), avisos: r.avisos.map(limpiar) };
}
