import { registerAs } from '@nestjs/config';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const billingConfig = registerAs('billing', () => ({
  proUsdCents: parsePositiveInt(process.env['BILLING_PRO_USD_CENTS'], 500),
  businessUsdCents: parsePositiveInt(
    process.env['BILLING_BUSINESS_USD_CENTS'],
    5000,
  ),
  trialDays: parsePositiveInt(process.env['BILLING_TRIAL_DAYS'], 7),
  graceDays: parsePositiveInt(process.env['BILLING_GRACE_DAYS'], 10),
  mpProPreapprovalPlanId:
    process.env['BILLING_MP_PRO_PREAPPROVAL_PLAN_ID']?.trim() ?? '',
  mpBusinessPreapprovalPlanId:
    process.env['BILLING_MP_BUSINESS_PREAPPROVAL_PLAN_ID']?.trim() ?? '',
  dunningCron: process.env['BILLING_DUNNING_CRON']?.trim() || '0 */6 * * *',
  dunningJobId: 'billing-subscription-dunning',
}));
