import { describe, expect, it } from 'vitest';
import { type HorarioTurno, desdeLocal, liquidar, validarHorario, validarProgramacion, ventanasTurno } from '../src/index.js';

const t = (fecha: string, de: string, a: string, fechaFin = fecha) => ({ entrada: desdeLocal(fecha, de), salida: desdeLocal(fechaFin, a) });
const DIURNO = { horaInicio: '07:00', horaFin: '16:00', descansoInicio: '12:00', descansoFin: '13:00' }; // 8 h
const NOCHE = { horaInicio: '22:00', horaFin: '06:00' }; // 8 h
const AHORA = desdeLocal('2026-12-31', '00:00');
// Martes 3-nov-2026 (hábil), sábado 7 y domingo 8-nov-2026.
const prog = (entradas: [string, HorarioTurno | null][]) => new Map(entradas);

describe('horarios de turno', () => {
  it('calcula horas ordinarias y cruce de medianoche', () => {
    expect(ventanasTurno('2026-11-03', DIURNO).ordinariaMin).toBe(480);
    const n = ventanasTurno('2026-11-07', NOCHE);
    expect(n.ordinariaMin).toBe(480);
    expect(n.fin).toEqual(desdeLocal('2026-11-08', '06:00'));
  });
  it('rechaza descansos fuera del turno y más de 9 h ordinarias', () => {
    expect(validarHorario({ ...DIURNO, descansoInicio: '17:00', descansoFin: '18:00' })).toMatch(/dentro/);
    expect(validarHorario({ horaInicio: '06:00', horaFin: '16:00' })).toMatch(/9 h/);
    expect(validarHorario({ horaInicio: '06:00', horaFin: '15:00' })).toBeNull();
  });
});

describe('validar programación semanal', () => {
  const semana = (dias: number, h: object) =>
    Array.from({ length: dias }, (_, i) => ({ fecha: `2026-11-${String(2 + i).padStart(2, '0')}`, horario: h as never }));
  it('42 h máximo desde el 15-jul-2026', () => {
    expect(validarProgramacion(semana(5, { horaInicio: '07:00', horaFin: '15:24' })).errores).toEqual([]); // 5 × 8:24 = 42 h
    expect(validarProgramacion(semana(6, DIURNO)).errores[0]).toMatch(/máximo legal es 42 h/); // 48 h
  });
  it('exige un día de descanso y avisa de más de 8 h', () => {
    const r = validarProgramacion(semana(7, { horaInicio: '08:00', horaFin: '14:00' }));
    expect(r.errores.some((e) => /día de descanso/.test(e))).toBe(true);
    expect(validarProgramacion(semana(5, { horaInicio: '07:00', horaFin: '15:24' })).avisos).toHaveLength(5);
  });
});

describe('liquidar con turnos', () => {
  it('lo que excede el turno es extra aunque no pase de la jornada legal', () => {
    const p = prog([['2026-11-03', { horaInicio: '08:00', horaFin: '12:00' }]]); // 4 h programadas
    const [d] = liquidar([t('2026-11-03', '08:00', '14:00')], { programacion: p, ahora: AHORA }).dias;
    expect(d).toMatchObject({ jornadaDiariaMin: 240, origenJornada: 'TURNO', extrasMin: 120 });
  });

  it('llegar tarde se compensa saliendo tarde, con tardanza registrada', () => {
    const p = prog([['2026-11-03', { horaInicio: '08:00', horaFin: '16:00' }]]);
    const [d] = liquidar([t('2026-11-03', '09:00', '17:00')], { programacion: p, ahora: AHORA }).dias;
    expect(d).toMatchObject({ extrasMin: 0, tardanzaMin: 60, salidaAnticipadaMin: 0 });
  });

  it('las extras son las horas fuera del horario (llegó antes, de noche)', () => {
    const p = prog([['2026-11-03', { horaInicio: '08:00', horaFin: '16:00' }]]);
    const [d] = liquidar([t('2026-11-03', '05:00', '16:00')], { programacion: p, ahora: AHORA }).dias;
    expect(d!.minutos).toMatchObject({ ordinariaDiurna: 480, extraNocturna: 60, extraDiurna: 120 });
  });

  it('descanso presunto si no marcó la pausa; se respeta si la marcó', () => {
    const p = prog([['2026-11-03', DIURNO]]);
    const [sinPausa] = liquidar([t('2026-11-03', '07:00', '16:00')], { programacion: p, ahora: AHORA }).dias;
    expect(sinPausa).toMatchObject({ totalMin: 480, extrasMin: 0, descansoPresuntoMin: 60 });
    const [conPausa] = liquidar([t('2026-11-03', '07:00', '12:30'), t('2026-11-03', '13:30', '16:30')], { programacion: p, ahora: AHORA }).dias;
    expect(conPausa).toMatchObject({ totalMin: 510, extrasMin: 30, descansoPresuntoMin: 0 });
  });

  it('trabajo en día de descanso programado: todo extra', () => {
    const p = prog([['2026-11-03', null]]);
    const [d] = liquidar([t('2026-11-03', '08:00', '12:00')], { programacion: p, ahora: AHORA }).dias;
    expect(d).toMatchObject({ origenJornada: 'DESCANSO', extrasMin: 240 });
  });

  it('ausencia en turno terminado; turno futuro no cuenta', () => {
    const p = prog([['2026-11-03', DIURNO], ['2026-11-04', DIURNO]]);
    const { dias } = liquidar([], { programacion: p, ahora: desdeLocal('2026-11-04', '10:00') });
    expect(dias.map((d) => [d.fecha, d.ausente])).toEqual([['2026-11-03', true]]);
  });

  it('turno nocturno empezado después de medianoche pertenece al día programado', () => {
    const p = prog([['2026-11-07', NOCHE]]);
    const { dias } = liquidar([t('2026-11-08', '00:30', '06:00')], { programacion: p, ahora: AHORA });
    expect(dias).toHaveLength(1);
    expect(dias[0]).toMatchObject({ fecha: '2026-11-07', tardanzaMin: 150, extrasMin: 0 });
  });

  it('el recargo dominical va al día de descanso obligatorio pactado', () => {
    const domingo = [t('2026-11-08', '08:00', '12:00')];
    expect(liquidar(domingo).dias[0]!.minutos.ordinariaDiurnaDominical).toBe(240);
    const conLunesDeDescanso = liquidar(domingo, { diaDescanso: 1 }).dias[0]!;
    expect(conLunesDeDescanso.minutos.ordinariaDiurna).toBe(240);
    expect(liquidar([t('2026-11-09', '08:00', '12:00')], { diaDescanso: 1 }).dias[0]!.minutos.ordinariaDiurnaDominical).toBe(240);
  });
});
