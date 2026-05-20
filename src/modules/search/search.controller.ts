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
 * Ruta pública — no requiere autenticación para permitir búsquedas sin cuenta.
 */
@Public()
@ApiTags('search')
@ApiExtraModels(SearchResponseDto, SearchResultDto)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('professionals')
  @ApiOperation({
    summary: 'Buscar profesionales por radio geoespacial',
    description: `Combina **ST_DWithin** (PostGIS) con **Full Text Search en español** para encontrar
profesionales disponibles cerca de un punto geográfico.

- Radio default: 5 km. Máximo: 100 km.
- Solo devuelve profesionales con \`isAvailable: true\`.
- Los resultados se ordenan por distancia ascendente.
- \`q\` activa FTS con stemming en español sobre nombre y bio.
- \`categoryId\` filtra por categoría específica.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Resultados de la búsqueda con distancia calculada',
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
