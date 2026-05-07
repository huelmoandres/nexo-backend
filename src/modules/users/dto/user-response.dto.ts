import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompanySummaryDto } from './company-summary.dto';
import { ProfessionalProfileMeDto } from './professional-profile-me.dto';

export class UserResponseDto {
  @ApiProperty({ example: 'd6d34507-bfec-42f6-8c27-4aa6bd4f29ad' })
  id!: string;

  @ApiProperty({ example: 'pro@nexos.com' })
  email!: string;

  @ApiProperty({ example: 'María Profesional' })
  fullName!: string;

  @ApiProperty({ enum: Role, example: Role.INDEPENDENT_PRO })
  role!: Role;

  @ApiPropertyOptional({
    type: CompanySummaryDto,
    description: 'Empresa donde el usuario es empleado, o la que administra.',
  })
  company?: CompanySummaryDto | null;

  @ApiPropertyOptional({
    type: ProfessionalProfileMeDto,
    description: 'Perfil profesional si existe.',
  })
  professionalProfile?: ProfessionalProfileMeDto | null;
}
