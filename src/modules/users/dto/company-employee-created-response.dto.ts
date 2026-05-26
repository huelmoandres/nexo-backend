import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CompanyEmployeeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: Role, example: Role.COMPANY_EMPLOYEE })
  role!: Role;
}

export class CompanyEmployeeCreatedResponseDto {
  @ApiProperty({ type: CompanyEmployeeSummaryDto })
  employee!: CompanyEmployeeSummaryDto;
}
