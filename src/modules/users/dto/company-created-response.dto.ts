import { ApiProperty } from '@nestjs/swagger';
import { CompanySummaryDto } from './company-summary.dto';

export class CompanyCreatedResponseDto {
  @ApiProperty({ type: CompanySummaryDto })
  company!: CompanySummaryDto;
}
