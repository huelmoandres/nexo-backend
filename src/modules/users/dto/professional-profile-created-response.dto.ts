import { ApiProperty } from '@nestjs/swagger';
import { ProfessionalProfileMeDto } from './professional-profile-me.dto';

export class ProfessionalProfileCreatedResponseDto {
  @ApiProperty({ type: ProfessionalProfileMeDto })
  profile!: ProfessionalProfileMeDto;
}
