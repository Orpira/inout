import { describe, expect, it } from 'vitest';
import { desdeLocal, fechaLocal, horaLocal, lunesDeSemana, sumarDias } from '../src/index.js';

describe('zona horaria de Colombia', () => {
  it('convierte UTC a hora de Colombia sin importar la TZ del proceso', () => {
    // 2026-11-05 03:30 UTC = 2026-11-04 22:30 en Bogotá
    const t = new Date('2026-11-05T03:30:00Z');
    expect(fechaLocal(t)).toBe('2026-11-04');
    expect(horaLocal(t)).toBe('22:30');
  });

  it('desdeLocal es la inversa', () => {
    const t = desdeLocal('2026-03-29', '02:15'); // fecha de cambio de hora en Europa: irrelevante
    expect(t.toISOString()).toBe('2026-03-29T07:15:00.000Z');
    expect(fechaLocal(t)).toBe('2026-03-29');
    expect(horaLocal(t)).toBe('02:15');
  });

  it('aritmética de fechas civiles', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(lunesDeSemana('2026-11-08')).toBe('2026-11-02'); // domingo → lunes anterior
    expect(lunesDeSemana('2026-11-02')).toBe('2026-11-02');
  });
});
