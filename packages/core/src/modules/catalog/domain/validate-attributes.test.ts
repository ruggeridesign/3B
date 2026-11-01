import type { AttributeDefinition } from '@3b/contracts';
import { describe, expect, it } from 'vitest';
import { validateAttributeValues } from './validate-attributes';

function def(partial: Partial<AttributeDefinition>): AttributeDefinition {
  return {
    id: 'x',
    scope: 'global',
    scopeId: null,
    key: 'k',
    label: 'K',
    dataType: 'text',
    options: null,
    unit: null,
    filterable: false,
    variantAxis: false,
    createdAt: '',
    ...partial,
  };
}

describe('validateAttributeValues', () => {
  const defs = [
    def({ key: 'marca', dataType: 'text' }),
    def({ key: 'voltaje', dataType: 'number', unit: 'V' }),
    def({ key: 'inalambrico', dataType: 'boolean' }),
    def({ key: 'color', dataType: 'enum', options: ['negro', 'rojo'] }),
  ];

  it('acepta valores correctos', () => {
    expect(
      validateAttributeValues(defs, {
        marca: 'Bosch',
        voltaje: 650,
        inalambrico: true,
        color: 'negro',
      }),
    ).toEqual([]);
  });

  it('rechaza una clave desconocida', () => {
    expect(validateAttributeValues(defs, { peso: 2 })).toHaveLength(1);
  });

  it('rechaza tipos incorrectos', () => {
    const errs = validateAttributeValues(defs, {
      voltaje: 'mucho', // debería ser número
      inalambrico: 'sí', // debería ser booleano
    });
    expect(errs).toHaveLength(2);
  });

  it('rechaza un valor fuera de las opciones del enum', () => {
    expect(validateAttributeValues(defs, { color: 'verde' })).toHaveLength(1);
  });
});
