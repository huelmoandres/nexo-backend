import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { searchConfig } from '@config/search.config';
import type { SearchQueryDto } from './dto/search-query.dto';
import type { SearchResponseDto } from './dto/search-response.dto';
import { SearchRepository } from './search.repository';

const KM_TO_METERS = 1000;

/**
 * Lógica de negocio para búsqueda geoespacial de profesionales.
 *
 * Decisiones de diseño:
 * - isAvailable = true está fijo en el repositorio; no se expone como parámetro
 *   para evitar que el frontend muestre profesionales no disponibles.
 * - El radio, la página y el límite tienen defaults configurables en searchConfig.
 * - KM_TO_METERS es una constante matemática pura, no un parámetro de negocio.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    @Inject(searchConfig.KEY)
    private readonly config: ConfigType<typeof searchConfig>,
  ) {}

  async searchProfessionals(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const radiusKm = dto.radiusKm ?? this.config.defaultRadiusKm;
    const page = dto.page ?? this.config.defaultPage;
    const limit = dto.limit ?? this.config.defaultLimit;
    const offset = (page - 1) * limit;

    const filters = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: radiusKm * KM_TO_METERS,
      categoryId: dto.categoryId,
      q: dto.q?.trim() || undefined,
      limit,
      offset,
      ftsDictionary: this.config.ftsDictionary,
    };

    const [results, total] = await Promise.all([
      this.searchRepository.findProfessionals(filters),
      this.searchRepository.countProfessionals(filters),
    ]);

    return { results, total, page, limit };
  }
}
