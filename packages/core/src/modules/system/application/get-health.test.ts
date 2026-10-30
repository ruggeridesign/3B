import { describe, expect, it } from 'vitest';
import { getHealth } from './get-health';

describe('getHealth', () => {
  it('devuelve estado ok con servicio y versión', () => {
    const result = getHealth({ service: '3b-api', version: '1.2.3' });
    expect(result.status).toBe('ok');
    expect(result.service).toBe('3b-api');
    expect(result.version).toBe('1.2.3');
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});
