import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';

export class BillingPlanItemDto {
  @ApiProperty({ enum: SubscriptionPlan })
  code!: SubscriptionPlan;

  @ApiProperty({ example: 500, description: 'Precio mensual en centavos USD' })
  amountUsdCents!: number;

  @ApiProperty({ example: 'USD 5 / mes' })
  label!: string;

  @ApiProperty()
  trialDays!: number;
}

export class BillingPlansResponseDto {
  @ApiProperty({ type: [BillingPlanItemDto] })
  plans!: BillingPlanItemDto[];
}
