import { registerAs } from '@nestjs/config';

export type PayoutMode = 'manual' | 'gateway';

export const payoutConfig = registerAs('payout', () => {
  const raw = process.env['PAYOUT_MODE']?.trim().toLowerCase();
  const mode: PayoutMode = raw === 'gateway' ? 'gateway' : 'manual';
  return {
    mode,
    maxPayoutAttempts: parseInt(process.env['PAYOUT_MAX_ATTEMPTS'] ?? '5', 10),
    recoveryCron: process.env['PAYOUT_RECOVERY_CRON']?.trim() ?? '*/2 * * * *',
    recoveryBatchSize: parseInt(
      process.env['PAYOUT_RECOVERY_BATCH_SIZE'] ?? '25',
      10,
    ),
    stuckAttemptMs: parseInt(
      process.env['PAYOUT_STUCK_ATTEMPT_MS'] ?? '300000',
      10,
    ),
  };
});
