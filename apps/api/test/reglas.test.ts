import { desdeLocal } from '@inout/core';
import { describe, expect, it } from 'vitest';
import { seSolapan, validarTramo } from '../src/reglas.js';

const t = (de: string, a: string | null, id?: number) => ({
  id,
  entrada: desdeLocal('2026-11-03', de),
  salida: a ? desdeLocal('2026-11-03', a) : null,
});
const ahora = desdeLocal('2026-11-05', '12:00');

describe('reglas de corrección', () => {
  it('detecta solapes y permite tramos contiguos', () => {
    expect(seSolapan(t('08:00', '12:00'), t('11:00', '15:00'))).toBe(true);
    expect(seSolapan(t('08:00', '12:00'), t('12:00', '15:00'))).toBe(false);
    expect(seSolapan(t('08:00', '12:00'), t('10:00', null))).toBe(true); // marcación sin salida dentro del tramo
  });

  it('valida orden, futuro, duración y cruces', () => {
    expect(validarTramo(t('08:00', '17:00'), [], ahora)).toBeNull();
    expect(validarTramo(t('17:00', '08:00'), [], ahora)).toMatch(/posterior/);
    expect(validarTramo({ entrada: desdeLocal('2026-11-05', '13:00'), salida: null }, [], ahora)).toMatch(/futuro/);
    expect(validarTramo({ entrada: desdeLocal('2026-11-01', '08:00'), salida: desdeLocal('2026-11-02', '09:00') }, [], ahora)).toMatch(/24 h/);
    expect(validarTramo(t('08:00', '12:00', 1), [t('11:00', '15:00', 2)], ahora)).toMatch(/n\.º 2/);
  });

  it('una marcación no choca consigo misma al corregirla', () => {
    expect(validarTramo(t('07:00', '12:00', 1), [t('08:00', '12:00', 1)], ahora)).toBeNull();
  });
});
