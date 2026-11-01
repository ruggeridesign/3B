import { describe, expect, it } from 'vitest';
import { validateMovementQty } from './validate-movement';

describe('validateMovementQty', () => {
  it('rechaza qty cero o no entero', () => {
    expect(validateMovementQty('adjustment', 0)).not.toBeNull();
    expect(validateMovementQty('receipt', 1.5)).not.toBeNull();
  });

  it('exige signo positivo en receipt/return', () => {
    expect(validateMovementQty('receipt', 5)).toBeNull();
    expect(validateMovementQty('return', 2)).toBeNull();
    expect(validateMovementQty('receipt', -5)).not.toBeNull();
  });

  it('exige signo negativo en sale', () => {
    expect(validateMovementQty('sale', -3)).toBeNull();
    expect(validateMovementQty('sale', 3)).not.toBeNull();
  });

  it('admite cualquier signo (≠0) en adjustment', () => {
    expect(validateMovementQty('adjustment', 4)).toBeNull();
    expect(validateMovementQty('adjustment', -4)).toBeNull();
  });
});
