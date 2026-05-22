import { ApiProperty } from '@nestjs/swagger';
import { PlanEntitlementsDto } from '@modules/entitlements/dto/plan-entitlements.dto';

export class UserEntitlementsResponseDto {
  @ApiProperty({ enum: ['professional', 'company'] })
  subjectType!: 'professional' | 'company';

  @ApiProperty()
  subjectId!: string;

  @ApiProperty({ type: PlanEntitlementsDto })
  entitlements!: PlanEntitlementsDto;
}
