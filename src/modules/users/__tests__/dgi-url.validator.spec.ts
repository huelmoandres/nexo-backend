import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertDgiQrUrlAllowed } from '../providers/dgi-url.validator';

const HOSTS = ['efactura.dgi.gub.uy', 'dgi.gub.uy'];

describe('assertDgiQrUrlAllowed', () => {
  it('acepta URL oficial DGI', () => {
    const url = assertDgiQrUrlAllowed(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt?ruc=1',
      HOSTS,
    );
    expect(url.hostname).toBe('www.efactura.dgi.gub.uy');
  });

  it('rechaza dominio externo', () => {
    expect(() =>
      assertDgiQrUrlAllowed('https://evil.com/phish', HOSTS),
    ).toThrow(BadRequestException);
  });

  it('rechaza URL malformada', () => {
    expect(() => assertDgiQrUrlAllowed('not-a-url', HOSTS)).toThrow(
      BadRequestException,
    );
  });

  it('rechaza protocolo no http(s)', () => {
    expect(() =>
      assertDgiQrUrlAllowed('ftp://efactura.dgi.gub.uy/x', HOSTS),
    ).toThrow(BadRequestException);
  });

  it('acepta http en hosts permitidos', () => {
    const url = assertDgiQrUrlAllowed(
      'http://efactura.dgi.gub.uy/consultaQR',
      HOSTS,
    );
    expect(url.protocol).toBe('http:');
  });
});
