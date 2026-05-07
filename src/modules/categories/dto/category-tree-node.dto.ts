import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryTreeNodeDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Hogar' })
  name!: string;

  @ApiProperty({ example: 'hogar' })
  slug!: string;

  @ApiProperty({ example: false })
  supportsUrgency!: boolean;

  @ApiPropertyOptional({
    type: () => [CategoryTreeNodeDto],
    description: 'Subcategorías anidadas.',
  })
  children!: CategoryTreeNodeDto[];
}
