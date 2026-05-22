import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { SearchResultDto } from './dto/search-result.dto';
import { SearchService } from './search.service';

/**
 * Motor de búsqueda geoespacial de Nexos.
 * Ruta pública — no requiere autenticación.
 */
@Public()
@ApiTags('search')
@ApiExtraModels(SearchResponseDto, SearchResultDto)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('professionals')
  @ApiOperation({
    summary: 'Buscar profesionales y empresas por radio geoespacial',
    description: `Combina **ServiceArea** (PostGIS) con FTS en español. Devuelve resultados
polimórficos (\`type: professional | company\`) ordenados por distancia.

- Radio default: 5 km. Máximo: 100 km.
- Solo sujetos con \`isAvailable: true\` y al menos una zona que cubra el punto.
- \`q\` activa expansión IA + FTS/trigram sobre nombre, bio y categorías.
- \`categoryId\` filtra por categoría (pro o empresa).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Resultados mezclados (profesional y empresa) con distancia',
    type: SearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Parámetros de query inválidos (latitud/longitud fuera de rango, etc.)',
  })
  async searchProfessionals(
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.searchProfessionals(query);
  }
}
