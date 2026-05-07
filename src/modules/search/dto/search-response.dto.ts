import { ApiProperty } from '@nestjs/swagger';
import { SearchResultDto } from './search-result.dto';

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  results!: SearchResultDto[];

  @ApiProperty({
    example: 12,
    description: 'Total de resultados para la query (sin paginar).',
  })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}
