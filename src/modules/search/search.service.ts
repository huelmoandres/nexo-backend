import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { searchConfig } from '@config/search.config';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { EntitlementsService } from '@modules/entitlements/entitlements.service';
import type { SearchQueryDto } from './dto/search-query.dto';
import type { SearchResponseDto } from './dto/search-response.dto';
import type { SearchResultDto } from './dto/search-result.dto';
import { SearchRepository } from './search.repository';
import { SearchQueryExpanderService } from './search-query-expander.service';

const KM_TO_METERS = 1000;

/**
 * Búsqueda geoespacial de profesionales y empresas (multi-zona vía ServiceArea).
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private platformQueryExpansionEnabled = false;

  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly queryExpander: SearchQueryExpanderService,
    private readonly entitlements: EntitlementsService,
    @Inject(searchConfig.KEY)
    private readonly config: ConfigType<typeof searchConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    const free = await this.entitlements.resolveByPlanDefinitionId(
      CATALOG_PLAN_IDS.FREE,
    );
    this.platformQueryExpansionEnabled =
      this.entitlements.isSearchQueryExpansionEnabled(free);
  }

  async searchProfessionals(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const radiusKm = dto.radiusKm ?? this.config.defaultRadiusKm;
    const page = dto.page ?? this.config.defaultPage;
    const limit = dto.limit ?? this.config.defaultLimit;
    const offset = (page - 1) * limit;

    const q = dto.q?.trim() || undefined;
    let expandedTerms: string[] | undefined;
    if (q) {
      if (this.config.expansion.enabled && this.platformQueryExpansionEnabled) {
        expandedTerms = await this.queryExpander.expand(q);
      } else {
        // FTS/trigram siempre con el término original; expansión IA es opt-in por catálogo.
        expandedTerms = [q];
      }
    }

    const baseFilters = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: radiusKm * KM_TO_METERS,
      categoryId: dto.categoryId,
      q,
      expandedTerms,
      ftsDictionary: this.config.ftsDictionary,
      trgmThreshold: this.config.trgmThreshold,
    };

    const fetchSize = limit + offset;

    const [professionals, companies, totalPro, totalCo] = await Promise.all([
      this.searchRepository.findProfessionals({
        ...baseFilters,
        limit: fetchSize,
        offset: 0,
      }),
      this.searchRepository.findCompanies({
        ...baseFilters,
        limit: fetchSize,
        offset: 0,
      }),
      this.searchRepository.countProfessionals({
        ...baseFilters,
        limit: 0,
        offset: 0,
      }),
      this.searchRepository.countCompanies({
        ...baseFilters,
        limit: 0,
        offset: 0,
      }),
    ]);

    const merged = this.mergeByDistance([...professionals, ...companies]);
    const results = merged.slice(offset, offset + limit);

    return {
      results,
      total: totalPro + totalCo,
      page,
      limit,
    };
  }

  private mergeByDistance(items: SearchResultDto[]): SearchResultDto[] {
    return [...items].sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
}
