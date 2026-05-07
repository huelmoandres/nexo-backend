import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Electricidad' })
  name!: string;

  @ApiProperty({ example: 'electricidad' })
  slug!: string;

  @ApiProperty({ example: false })
  supportsUrgency!: boolean;

  @ApiPropertyOptional({
    example: null,
    description: 'ID de la categoría padre, o null si es raíz.',
    nullable: true,
  })
  parentId!: string | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}
