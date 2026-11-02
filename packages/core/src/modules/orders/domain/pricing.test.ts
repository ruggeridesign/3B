import { describe, expect, it } from 'vitest';
import { computeTotals, fromCents, lineTotalCents, toCents } from './pricing';

describe('orders/pricing: montos en centavos enteros', () => {
  it('toCents/fromCents hacen ida y vuelta', () => {
    expect(toCents('49.90')).toBe(4990);
    expect(toCents('12')).toBe(1200);
    expect(toCents('0.05')).toBe(5);
    expect(fromCents(4990)).toBe('49.90');
    expect(fromCents(1200)).toBe('12.00');
    expect(fromCents(5)).toBe('0.05');
  });

  it('rechaza montos y cantidades inválidas', () => {
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents('1.234')).toThrow();
    expect(() => lineTotalCents('1.00', 0)).toThrow();
    expect(() => lineTotalCents('1.00', 1.5)).toThrow();
  });

  it('suma líneas sin perder centavos', () => {
    const t = computeTotals([
      { unitPrice: '49.90', currency: 'USD', qty: 2 },
      { unitPrice: '0.05', currency: 'USD', qty: 3 },
    ]);
    expect(t.lineTotals).toEqual(['99.80', '0.15']);
    expect(t.subtotal).toBe('99.95');
    expect(t.total).toBe('99.95'); // sin envío ni comisión en M5a
  });

  it('suma envío y comisión al total', () => {
    const t = computeTotals([{ unitPrice: '10.00', currency: 'USD', qty: 1 }], {
      shipping: '2.50',
      fee: '0.50',
    });
    expect(t.subtotal).toBe('10.00');
    expect(t.total).toBe('13.00');
  });

  it('rechaza mezcla de monedas y listas vacías', () => {
    expect(() =>
      computeTotals([
        { unitPrice: '1.00', currency: 'USD', qty: 1 },
        { unitPrice: '1.00', currency: 'VES', qty: 1 },
      ]),
    ).toThrow();
    expect(() => computeTotals([])).toThrow();
  });
});
