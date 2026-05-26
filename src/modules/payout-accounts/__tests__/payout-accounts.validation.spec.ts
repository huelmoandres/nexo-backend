import { PayoutIdentifierType, PayoutMethod } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDestinationSnapshot,
  maskTransferIdentifier,
  rejectCardFields,
  validatePayoutFields,
} from '../payout-accounts.validation';

describe('payout-accounts.validation', () => {
  it('rechaza campos de tarjeta', () => {
    expect(() =>
      rejectCardFields({ cardNumber: '4111111111111111' }),
    ).toThrow();
  });

  it('valida CVU 22 dígitos', () => {
    const r = validatePayoutFields({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_CVU,
      transferIdentifier: '0000003100012345678901',
    });
    expect(r.transferIdentifier).toHaveLength(22);
  });

  it('rechaza CVU de 16 dígitos', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_CVU,
        transferIdentifier: '4111111111111111',
      }),
    ).toThrow();
  });

  it('valida alias MP', () => {
    const r = validatePayoutFields({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_ALIAS,
      mpAlias: 'juan.plomero',
    });
    expect(r.mpAlias).toBe('juan.plomero');
  });

  it('valida BANK_TRANSFER_KEY', () => {
    const r = validatePayoutFields({
      method: PayoutMethod.BANK,
      identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
      transferIdentifier: '0000003100012345678901',
      accountHolderName: 'Juan Perez',
      bankId: 'bank-1',
    });
    expect(r.transferIdentifier).toHaveLength(22);
  });

  it('valida MP_PHONE', () => {
    const r = validatePayoutFields({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_PHONE,
      transferIdentifier: '+59899123456',
    });
    expect(r.transferIdentifier).toBe('+59899123456');
  });

  it('mask branches', () => {
    expect(
      maskTransferIdentifier(PayoutIdentifierType.MP_ALIAS, null, 'ab'),
    ).toBe('****');
    expect(
      maskTransferIdentifier(PayoutIdentifierType.MP_CVU, null, null),
    ).toBe('—');
    expect(
      maskTransferIdentifier(PayoutIdentifierType.MP_CVU, 'short', null),
    ).toBe('****');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        'ab@example.com',
        null,
      ),
    ).toContain('@');
  });

  it('buildDestinationSnapshot', () => {
    expect(
      buildDestinationSnapshot({
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        transferIdentifier: '0000003100012345678901',
        mpAlias: null,
        accountHolderName: 'Juan',
        bank: { code: 'BROU', name: 'BROU' },
      }),
    ).toMatchObject({ bankCode: 'BROU' });
  });

  it('rechaza MP_EMAIL inválido y acepta válido', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        transferIdentifier: 'bad',
      }),
    ).toThrow();
    const ok = validatePayoutFields({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'user@example.com',
    });
    expect(ok.transferIdentifier).toBe('user@example.com');
  });

  it('rechaza alias MP inválido y default MP', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_ALIAS,
        mpAlias: 'ab',
      }),
    ).toThrow();
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: 'UNKNOWN' as PayoutIdentifierType,
        transferIdentifier: 'x',
      }),
    ).toThrow();
  });

  it('rechaza MP_PHONE inválido y transfer vacío en bank', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_PHONE,
        transferIdentifier: '099123',
      }),
    ).toThrow();
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        transferIdentifier: '',
        accountHolderName: 'Juan Perez',
        bankId: 'b1',
      }),
    ).toThrow();
  });

  it('normalizeDigits null para valor ausente', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_CVU,
        transferIdentifier: undefined,
      }),
    ).toThrow();
  });

  it('normalizeDigits devuelve null para solo no-dígitos', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_CVU,
        transferIdentifier: '----',
      }),
    ).toThrow();
  });

  it('rechaza bank sin bankId o titular corto', () => {
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        transferIdentifier: '0000003100012345678901',
        accountHolderName: 'ab',
        bankId: 'b1',
      }),
    ).toThrow();
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        transferIdentifier: '0000003100012345678901',
        accountHolderName: 'Juan Perez',
      }),
    ).toThrow();
    expect(() =>
      validatePayoutFields({
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.MP_CVU,
        transferIdentifier: '0000003100012345678901',
      }),
    ).toThrow();
  });

  it('mask alias largo y email sin user', () => {
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_ALIAS,
        null,
        'juan.plomero',
      ),
    ).toMatch(/\*\*\*/);
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        '@domain.com',
        null,
      ),
    ).toBe('***@domain.com');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        'ab@test.com',
        null,
      ),
    ).toContain('ab');
    expect(
      maskTransferIdentifier(PayoutIdentifierType.MP_EMAIL, 'user@', null),
    ).toContain('@');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        'xy@example.com',
        null,
      ),
    ).toBe('xy***@example.com');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        '@nodomain',
        null,
      ),
    ).toBe('***@nodomain');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        '@',
        null,
      ),
    ).toBe('***@');
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_EMAIL,
        'ab@c.com',
        null,
      ),
    ).toBe('ab***@c.com');
  });

  it('mask email con partes undefined tras split', () => {
    const splitSpy = vi
      .spyOn(String.prototype, 'split')
      .mockReturnValueOnce([undefined, undefined] as never);
    expect(
      maskTransferIdentifier(PayoutIdentifierType.MP_EMAIL, 'a@b.com', null),
    ).toBe('***@');
    splitSpy.mockRestore();
  });

  afterEach(() => vi.restoreAllMocks());

  it('buildDestinationSnapshot sin banco', () => {
    expect(
      buildDestinationSnapshot({
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        transferIdentifier: 'a@b.com',
        mpAlias: null,
        accountHolderName: null,
        bank: null,
      }),
    ).toMatchObject({ bankCode: null, bankName: null });
  });

  it('enmascara identificador', () => {
    expect(
      maskTransferIdentifier(
        PayoutIdentifierType.MP_CVU,
        '0000003100012345678901',
        null,
      ),
    ).toMatch(/\*\*\*\*8901/);
  });
});
