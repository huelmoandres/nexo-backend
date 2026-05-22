import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { GeoEntitySummaryDto } from './dto/geo-entity-summary.dto';
import { GeoResolveRequestDto } from './dto/geo-resolve-request.dto';
import { GeoResolveResponseDto } from './dto/geo-resolve-response.dto';
import { GeoTreeNodeDto } from './dto/geo-tree-node.dto';
import { GeoResolveService } from './geo-resolve.service';
import { GeoService } from './geo.service';

@ApiTags('geo')
@ApiExtraModels(
  GeoTreeNodeDto,
  GeoEntitySummaryDto,
  GeoResolveRequestDto,
  GeoResolveResponseDto,
  ProblemDetail,
)
@Controller('geo')
export class GeoController {
  constructor(
    private readonly geoService: GeoService,
    private readonly geoResolveService: GeoResolveService,
  ) {}

  @Public()
  @Get('tree')
  @ApiOperation({
    summary: 'Árbol geo Uruguay (cacheado)',
    description:
      'País → departamentos → ciudades → barrios. Cache Redis (TTL configurable).',
  })
  @ApiResponse({ status: 200, type: [GeoTreeNodeDto] })
  async getTree(): Promise<GeoTreeNodeDto[]> {
    return this.geoService.getTree();
  }

  @Public()
  @Get('states')
  @ApiOperation({ summary: 'Departamentos de Uruguay' })
  @ApiResponse({ status: 200, type: [GeoEntitySummaryDto] })
  async listStates(): Promise<GeoEntitySummaryDto[]> {
    return this.geoService.listStates();
  }

  @Public()
  @Get('states/:stateId/cities')
  @ApiParam({ name: 'stateId', format: 'uuid' })
  @ApiOperation({ summary: 'Ciudades/localidades de un departamento' })
  @ApiResponse({ status: 200, type: [GeoEntitySummaryDto] })
  async listCities(
    @Param('stateId', ParseUUIDPipe) stateId: string,
  ): Promise<GeoEntitySummaryDto[]> {
    return this.geoService.listCities(stateId);
  }

  @Public()
  @Get('cities/:cityId/neighborhoods')
  @ApiParam({ name: 'cityId', format: 'uuid' })
  @ApiOperation({ summary: 'Barrios de una ciudad' })
  @ApiResponse({ status: 200, type: [GeoEntitySummaryDto] })
  async listNeighborhoods(
    @Param('cityId', ParseUUIDPipe) cityId: string,
  ): Promise<GeoEntitySummaryDto[]> {
    return this.geoService.listNeighborhoods(cityId);
  }

  @Public()
  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Búsqueda por nombre en catálogo geo' })
  async search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20;
    return this.geoService.search(q, parsedLimit);
  }

  @Public()
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolver dirección o GPS a IDs geo',
    description:
      'Forward geocode con addressLine o reverse con lat/lng. Siempre HTTP 200; resolved=false si no hay match.',
  })
  @ApiResponse({ status: 200, type: GeoResolveResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Sin addressLine ni coordenadas',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async resolve(
    @Body() dto: GeoResolveRequestDto,
  ): Promise<GeoResolveResponseDto> {
    return this.geoResolveService.resolve(dto);
  }
}
