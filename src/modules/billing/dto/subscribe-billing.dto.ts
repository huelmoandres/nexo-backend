import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';
import { IsIn } from 'class-validator';

const BILLING_SELF_SERVICE_PLANS = [
  SubscriptionPlan.PRO,
  SubscriptionPlan.BUSINESS,
] as const;

export type BillingSelfServicePlan =
  (typeof BILLING_SELF_SERVICE_PLANS)[number];

export class SubscribeBillingDto {
  @ApiProperty({ enum: BILLING_SELF_SERVICE_PLANS })
  @IsIn(BILLING_SELF_SERVICE_PLANS)
  plan!: BillingSelfServicePlan;
}
