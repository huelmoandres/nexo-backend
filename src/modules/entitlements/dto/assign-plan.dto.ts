import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';
import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PlanEntitlementsDto } from './plan-entitlements.dto';

export class AssignSubscriptionPlanDto {
  @ApiProperty({ enum: SubscriptionPlan, example: SubscriptionPlan.PRO })
  @IsEnum(SubscriptionPlan)
  subscriptionPlan!: SubscriptionPlan;

  @ApiPropertyOptional({
    type: PlanEntitlementsDto,
    description: 'Obligatorio cuando subscriptionPlan es CUSTOM',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanEntitlementsDto)
  entitlements?: PlanEntitlementsDto;
}

export class CreateCustomPlanDto {
  @ApiProperty({ type: PlanEntitlementsDto })
  @ValidateNested()
  @Type(() => PlanEntitlementsDto)
  entitlements!: PlanEntitlementsDto;
}
