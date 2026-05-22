/** IDs fijos del seed `prisma/seed.currencies.js`. */
export const CURRENCY_IDS = {
  UYU: 'c0000000-0000-4000-8000-000000000001',
  USD: 'c0000000-0000-4000-8000-000000000002',
} as const;

export const CURRENCY_CODES = {
  UYU: 'UYU',
  USD: 'USD',
} as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[keyof typeof CURRENCY_CODES];
