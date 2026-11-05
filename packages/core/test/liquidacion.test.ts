import { describe, expect, it } from 'vitest';
import { desdeLocal, liquidar, parametrosEn, valorAdicionalDia } from '../src/index.js';

const turno = (fecha: string, de: string, a: string, fechaFin = fecha) => ({
  entrada: desdeLocal(fecha, de),
  salida: desdeLocal(fechaFin, a),
});

describe('parámetros vigentes', () => {
  it('jornada 42 h desde 15-jul-2026', () => {
    expect(parametrosEn('2026-07-14').jornadaSemanalHoras).toBe(44);
    expect(parametrosEn('2026-07-15')).toMatchObject({ jornadaSemanalHoras: 42, divisorMensual: 210, jornadaDiariaMin: 420 });
  });
  it('nocturna desde las 19:00 a partir del 25-dic-2025', () => {
    expect(parametrosEn('2025-12-24').inicioNocturnaMin).toBe(21 * 60);
    expect(parametrosEn('2025-12-25').inicioNocturnaMin).toBe(19 * 60);
  });
});

describe('liquidar', () => {
  it('jornada ordinaria diurna en día hábil', () => {
    // jueves 5-nov-2026, 7 h
    const { dias } = liquidar([turno('2026-11-05', '08:00', '15:00')]);
    expect(dias[0]?.minutos.ordinariaDiurna).toBe(420);
    expect(dias[0]?.extrasMin).toBe(0);
    expect(dias[0]?.minutosPonderados).toBe(0);
  });

  it('turnos partidos consumen la misma jornada; el exceso es extra y desde las 19:00 nocturno', () => {
    const { dias } = liquidar([
      turno('2026-11-05', '06:00', '11:00'), // 300 ord. diurnas
      turno('2026-11-05', '15:00', '20:00'), // 15-17 ordinarias, 17-20 extras
    ]);
    const m = dias[0]!.minutos;
    expect(m.ordinariaDiurna).toBe(420);
    expect(m.extraDiurna).toBe(120); // 17:00-19:00
    expect(m.extraNocturna).toBe(60); // 19:00-20:00
    expect(dias[0]!.extrasMin).toBe(180);
  });

  it('turno nocturno que cruza a domingo', () => {
    // sábado 7-nov-2026 22:00 → domingo 8-nov 06:00
    const { dias } = liquidar([turno('2026-11-07', '22:00', '06:00', '2026-11-08')]);
    expect(dias).toHaveLength(1);
    const m = dias[0]!.minutos;
    expect(m.ordinariaNocturna).toBe(120); // 22:00-24:00 sábado
    expect(m.ordinariaNocturnaDominical).toBe(300); // 00:00-05:00 domingo (420 min de jornada)
    expect(m.extraNocturnaDominical).toBe(60); // 05:00-06:00
  });

  it('alerta de más de 2 h extra en el día', () => {
    const { dias } = liquidar([turno('2026-11-05', '06:00', '16:00')]);
    expect(dias[0]!.extrasMin).toBe(180);
    expect(dias[0]!.alertaExtrasDia).toBe(true);
  });

  it('valor adicional usa el divisor vigente', () => {
    const { dias } = liquidar([turno('2026-11-05', '06:00', '14:00')]); // 1 h extra diurna
    expect(valorAdicionalDia(dias[0]!, 2_100_000)).toBe(12_500); // 10.000/h × 1,25
  });
});
