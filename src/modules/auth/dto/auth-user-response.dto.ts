import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AuthUserResponseDto {
  @ApiProperty({ example: 'd6d34507-bfec-42f6-8c27-4aa6bd4f29ad' })
  id!: string;

  @ApiProperty({ example: '611f8a4a-6e6f-4a9a-b769-4d8f120cb41b' })
  supabaseUid!: string;

  @ApiProperty({ example: 'test@nexos.com' })
  email!: string;

  @ApiProperty({ example: 'Test User' })
  fullName!: string;

  @ApiProperty({ enum: Role, example: Role.CLIENT })
  role!: Role;
}
