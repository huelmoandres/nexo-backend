import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionBillingStatus, SubscriptionPlan } from '@prisma/client';

export class BillingSubscriptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SubscriptionPlan })
  planCode!: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionBillingStatus })
  status!: SubscriptionBillingStatus;

  @ApiPropertyOptional()
  trialEndsAt?: string | null;

  @ApiPropertyOptional()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional()
  graceEndsAt?: string | null;

  @ApiPropertyOptional()
  billingAmountUsdCents?: number | null;

  @ApiPropertyOptional()
  billingAmountUyuCents?: number | null;
}

export class SubscribeBillingResponseDto {
  @ApiProperty()
  subscriptionId!: string;

  @ApiProperty()
  initPoint!: string;

  @ApiProperty({ enum: SubscriptionBillingStatus })
  status!: SubscriptionBillingStatus;
}
