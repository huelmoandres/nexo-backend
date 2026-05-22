import { PayoutIdentifierType, PayoutMethod } from '@prisma/client';
import { problemException } from '@common/errors/problem.factory';

const CARD_PAN_REGEX = /^\d{16}$/;
const CVU_CBU_REGEX = /^\d{22}$/;
const MP_ALIAS_REGEX = /^[a-zA-Z0-9._-]{6,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UY_PHONE_REGEX = /^\+598\d{8,9}$/;

export function rejectCardFields(body: Record<string, unknown>): void {
  const forbidden = ['cardNumber', 'pan', 'cvv', 'card_number'];
  for (const key of forbidden) {
    if (body[key] != null) {
      throw problemException(
        'PAYOUT_IDENTIFIER_INVALID',
        'No se aceptan datos de tarjeta como destino de cobro.',
      );
    }
  }
}

export function validatePayoutFields(input: {
  method: PayoutMethod;
  identifierType: PayoutIdentifierType;
  transferIdentifier?: string | null;
  mpAlias?: string | null;
  accountHolderName?: string | null;
  bankId?: string | null;
}): { transferIdentifier: string | null; mpAlias: string | null } {
  rejectCardFields(input as Record<string, unknown>);

  if (input.method === PayoutMethod.MERCADO_PAGO) {
    return validateMercadoPago(input);
  }
  return validateBank(input);
}

function validateMercadoPago(input: {
  identifierType: PayoutIdentifierType;
  transferIdentifier?: string | null;
  mpAlias?: string | null;
}): { transferIdentifier: string | null; mpAlias: string | null } {
  switch (input.identifierType) {
    case PayoutIdentifierType.MP_CVU: {
      const id = normalizeDigits(input.transferIdentifier);
      if (!id || !CVU_CBU_REGEX.test(id) || CARD_PAN_REGEX.test(id)) {
        throw problemException(
          'PAYOUT_IDENTIFIER_INVALID',
          'CVU debe tener 22 dígitos numéricos.',
        );
      }
      return { transferIdentifier: id, mpAlias: null };
    }
    case PayoutIdentifierType.MP_ALIAS: {
      const alias = input.mpAlias?.trim();
      if (!alias || !MP_ALIAS_REGEX.test(alias)) {
        throw problemException(
          'PAYOUT_IDENTIFIER_INVALID',
          'Alias MP: 6–20 caracteres alfanuméricos.',
        );
      }
      return { transferIdentifier: null, mpAlias: alias };
    }
    case PayoutIdentifierType.MP_EMAIL: {
      const email = input.transferIdentifier?.trim().toLowerCase();
      if (!email || !EMAIL_REGEX.test(email)) {
        throw problemException(
          'PAYOUT_IDENTIFIER_INVALID',
          'Email de cuenta Mercado Pago inválido.',
        );
      }
      return { transferIdentifier: email, mpAlias: null };
    }
    case PayoutIdentifierType.MP_PHONE: {
      const phone = input.transferIdentifier?.trim();
      if (!phone || !UY_PHONE_REGEX.test(phone)) {
        throw problemException(
          'PAYOUT_IDENTIFIER_INVALID',
          'Teléfono debe ser +598 seguido de 8–9 dígitos.',
        );
      }
      return { transferIdentifier: phone, mpAlias: null };
    }
    default:
      throw problemException('PAYOUT_IDENTIFIER_INVALID');
  }
}

function validateBank(input: {
  identifierType: PayoutIdentifierType;
  transferIdentifier?: string | null;
  accountHolderName?: string | null;
  bankId?: string | null;
}): { transferIdentifier: string | null; mpAlias: string | null } {
  if (input.identifierType !== PayoutIdentifierType.BANK_TRANSFER_KEY) {
    throw problemException('PAYOUT_IDENTIFIER_INVALID');
  }
  if (!input.bankId) {
    throw problemException('PAYOUT_BANK_NOT_ALLOWED');
  }
  const holder = input.accountHolderName?.trim();
  if (!holder || holder.length < 3) {
    throw problemException(
      'PAYOUT_IDENTIFIER_INVALID',
      'Titular de cuenta requerido (mín. 3 caracteres).',
    );
  }
  const id = normalizeDigits(input.transferIdentifier);
  if (!id || !CVU_CBU_REGEX.test(id)) {
    throw problemException(
      'PAYOUT_IDENTIFIER_INVALID',
      'Clave de transferencia bancaria: 22 dígitos.',
    );
  }
  return { transferIdentifier: id, mpAlias: null };
}

function normalizeDigits(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function maskTransferIdentifier(
  identifierType: PayoutIdentifierType,
  transferIdentifier: string | null,
  mpAlias: string | null,
): string {
  if (identifierType === PayoutIdentifierType.MP_ALIAS && mpAlias) {
    return mpAlias.length > 4
      ? `${mpAlias.slice(0, 2)}***${mpAlias.slice(-2)}`
      : '****';
  }
  if (!transferIdentifier) {
    return '—';
  }
  if (transferIdentifier.includes('@')) {
    const [user, domain] = transferIdentifier.split('@');
    return `${user?.slice(0, 2) ?? ''}***@${domain ?? ''}`;
  }
  if (transferIdentifier.length <= 6) {
    return '****';
  }
  return `****${transferIdentifier.slice(-4)}`;
}

export function buildDestinationSnapshot(account: {
  method: PayoutMethod;
  identifierType: PayoutIdentifierType;
  transferIdentifier: string | null;
  mpAlias: string | null;
  accountHolderName: string | null;
  bank?: { code: string; name: string } | null;
}): Record<string, unknown> {
  return {
    method: account.method,
    identifierType: account.identifierType,
    maskedIdentifier: maskTransferIdentifier(
      account.identifierType,
      account.transferIdentifier,
      account.mpAlias,
    ),
    accountHolderName: account.accountHolderName,
    bankCode: account.bank?.code ?? null,
    bankName: account.bank?.name ?? null,
  };
}
