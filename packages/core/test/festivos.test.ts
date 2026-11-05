import { describe, expect, it } from 'vitest';
import { Calendario, domingoDePascua, festivosDelAnio } from '../src/index.js';

describe('festivos de Colombia', () => {
  it('Pascua', () => {
    expect(domingoDePascua(2025)).toBe('2025-04-20');
    expect(domingoDePascua(2026)).toBe('2026-04-05');
  });

  it('calendario 2025 (publicado)', () => {
    expect(festivosDelAnio(2025).map((f) => f.fecha)).toEqual([
      '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18',
      '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20',
      '2025-08-07', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17',
      '2025-12-08', '2025-12-25',
    ]);
  });

  it('2026 incluye el 9 de julio y los traslados Emiliani', () => {
    const fechas = festivosDelAnio(2026).map((f) => f.fecha);
    expect(fechas).toContain('2026-07-09');
    expect(fechas).toContain('2026-01-12'); // Reyes
    expect(fechas).toContain('2026-05-18'); // Ascensión
    expect(fechas).toHaveLength(19);
  });

  it('ajustes desde el panel', () => {
    const cal = new Calendario([{ fecha: '2026-07-09', tipo: 'QUITAR' }]);
    expect(cal.esFestivo('2026-07-09')).toBe(false);
    expect(cal.esDominicalOFestivo('2026-11-08')).toBe(true); // domingo
  });
});
