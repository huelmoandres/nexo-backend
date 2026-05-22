import { registerAs } from '@nestjs/config';

export type PayoutMode = 'manual' | 'gateway';

export const payoutConfig = registerAs('payout', () => {
  const raw = process.env['PAYOUT_MODE']?.trim().toLowerCase();
  const mode: PayoutMode = raw === 'gateway' ? 'gateway' : 'manual';
  return {
    mode,
    maxPayoutAttempts: parseInt(process.env['PAYOUT_MAX_ATTEMPTS'] ?? '5', 10),
  };
});
