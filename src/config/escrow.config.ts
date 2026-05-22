import { registerAs } from '@nestjs/config';

export const escrowConfig = registerAs('escrow', () => ({
  silentAcceptanceBusinessDays: parseInt(
    process.env['ESCROW_SILENT_ACCEPTANCE_BUSINESS_DAYS'] ?? '2',
    10,
  ),
  commissionRateBps: parseInt(
    process.env['ESCROW_COMMISSION_RATE_BPS'] ?? '500',
    10,
  ),
  systemUserId: process.env['ESCROW_SYSTEM_USER_ID'] ?? null,
}));
