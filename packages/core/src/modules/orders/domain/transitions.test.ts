import { describe, expect, it } from 'vitest';
import {
  canTransition,
  findTransition,
  nextStatuses,
  stockEffect,
  transitionsFor,
} from './transitions';

describe('orders · máquina de estados (dominio)', () => {
  it('acepta aristas válidas de §6', () => {
    expect(canTransition('realizado', 'aceptado')).toBe(true);
    expect(canTransition('realizado', 'rechazado')).toBe(true);
    expect(canTransition('aceptado', 'listo')).toBe(true);
    expect(canTransition('aceptado', 'cancelado')).toBe(true);
    expect(canTransition('listo', 'retirado')).toBe(true);
  });

  it('rechaza aristas que no existen', () => {
    expect(canTransition('realizado', 'listo')).toBe(false);
    expect(canTransition('realizado', 'completado')).toBe(false);
    expect(canTransition('cancelado', 'aceptado')).toBe(false); // terminal
    expect(canTransition('aceptado', 'realizado')).toBe(false); // no retrocede
  });

  it('expone el actor de cada arista', () => {
    expect(findTransition('realizado', 'aceptado')?.by).toBe('seller');
    expect(findTransition('aceptado', 'cancelado')?.by).toBe('maker');
    expect(findTransition('realizado', 'expirado')?.by).toBe('system');
  });

  it('lista próximos estados y los filtra por actor', () => {
    const outs = nextStatuses('realizado')
      .map((t) => t.to)
      .sort();
    expect(outs).toEqual(['aceptado', 'expirado', 'rechazado']);
    expect(
      transitionsFor('realizado', 'seller')
        .map((t) => t.to)
        .sort(),
    ).toEqual(['aceptado', 'rechazado']);
    expect(transitionsFor('realizado', 'maker')).toHaveLength(0);
  });

  it('traduce la transición a su efecto sobre el stock', () => {
    expect(stockEffect('aceptado')).toBe('reserve');
    expect(stockEffect('cancelado')).toBe('release');
    expect(stockEffect('rechazado')).toBe('release');
    expect(stockEffect('retirado')).toBe('consume');
    expect(stockEffect('listo')).toBe('none');
  });
});
