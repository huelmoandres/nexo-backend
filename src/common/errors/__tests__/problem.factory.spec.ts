import { describe, expect, it } from 'vitest';
import { buildProblem, problemException } from '../problem.factory';

describe('buildProblem', () => {
  it('arma el shape con title y status del catálogo', () => {
    const body = buildProblem('AUTH_INVALID_TOKEN');
    expect(body).toEqual({
      title: 'Token inválido',
      status: 401,
      code: 'AUTH_INVALID_TOKEN',
    });
  });

  it('incluye detail cuando se provee', () => {
    const body = buildProblem('USER_NOT_FOUND', 'No hay fila');
    expect(body.detail).toBe('No hay fila');
    expect(body.code).toBe('USER_NOT_FOUND');
  });

  it('mergea extras (p. ej. photoIds)', () => {
    const body = buildProblem('PORTFOLIO_PHOTOS_NOT_READY', 'x', {
      photoIds: ['a', 'b'],
    });
    expect(body.photoIds).toEqual(['a', 'b']);
    expect(body.code).toBe('PORTFOLIO_PHOTOS_NOT_READY');
  });

  it('omite detail cuando es undefined', () => {
    const body = buildProblem('VALIDATION_ERROR', undefined, { errors: [] });
    expect('detail' in body).toBe(false);
    expect(body.errors).toEqual([]);
  });
});

describe('problemException', () => {
  it('devuelve HttpException con status y response del catálogo', () => {
    const ex = problemException('CONFLICT', 'duplicado');
    expect(ex.getStatus()).toBe(409);
    const res = ex.getResponse() as { code: string; detail: string };
    expect(res.code).toBe('CONFLICT');
    expect(res.detail).toBe('duplicado');
  });
});
