import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type Redis from 'ioredis';
import { buildProblem } from '@common/errors/problem.factory';
import { geoConfig } from '@config/geo.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import type { GeoEntitySummaryDto } from './dto/geo-entity-summary.dto';
import type { GeoTreeNodeDto } from './dto/geo-tree-node.dto';
import { GeoRepository } from './geo.repository';

@Injectable()
export class GeoService {
  constructor(
    private readonly geoRepository: GeoRepository,
    @Inject(REDIS_AUTH_CLIENT) private readonly redis: Redis,
    @Inject(geoConfig.KEY)
    private readonly config: ConfigType<typeof geoConfig>,
  ) {}

  async getTree(): Promise<GeoTreeNodeDto[]> {
    const cached = await this.redis.get(this.config.cacheKeyTree);
    if (cached) {
      return JSON.parse(cached) as GeoTreeNodeDto[];
    }

    const country = await this.geoRepository.findCountryByIso(
      this.config.countryIsoCode,
    );
    if (!country) {
      return [];
    }

    const rows = await this.geoRepository.findFlatHierarchyForCountry(
      country.id,
    );
    const tree = this.buildTreeFromFlat(rows, country);
    await this.redis.setex(
      this.config.cacheKeyTree,
      this.config.cacheTtlSeconds,
      JSON.stringify(tree),
    );
    return tree;
  }

  async listStates(): Promise<GeoEntitySummaryDto[]> {
    const country = await this.requireCountry();
    const states = await this.geoRepository.findStatesByCountryId(country.id);
    return states.map((s) => ({ id: s.id, name: s.name, slug: s.slug }));
  }

  async listCities(stateId: string): Promise<GeoEntitySummaryDto[]> {
    const cities = await this.geoRepository.findCitiesByStateId(stateId);
    return cities.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  }

  async listNeighborhoods(cityId: string): Promise<GeoEntitySummaryDto[]> {
    const neighborhoods =
      await this.geoRepository.findNeighborhoodsByCityId(cityId);
    return neighborhoods.map((n) => ({
      id: n.id,
      name: n.name,
      slug: n.slug,
    }));
  }

  async search(
    q: string,
    limit = 20,
  ): Promise<
    Array<
      GeoEntitySummaryDto & {
        level: 'state' | 'city' | 'neighborhood';
        stateId?: string;
        cityId?: string;
      }
    >
  > {
    const country = await this.requireCountry();
    const trimmed = q.trim();
    if (!trimmed) {
      return [];
    }
    return this.geoRepository.searchByName(country.id, trimmed, limit);
  }

  private async requireCountry() {
    const country = await this.geoRepository.findCountryByIso(
      this.config.countryIsoCode,
    );
    if (!country) {
      throw new NotFoundException(
        buildProblem(
          'GEO_COUNTRY_NOT_FOUND',
          'País de catálogo geo no configurado.',
        ),
      );
    }
    return country;
  }

  private buildTreeFromFlat(
    rows: Awaited<ReturnType<GeoRepository['findFlatHierarchyForCountry']>>,
    country: { id: string; name: string; slug: string },
  ): GeoTreeNodeDto[] {
    const stateMap = new Map<
      string,
      GeoTreeNodeDto['states'][number] & {
        citiesMap: Map<
          string,
          GeoTreeNodeDto['states'][number]['cities'][number]
        >;
      }
    >();

    for (const row of rows) {
      let state = stateMap.get(row.stateId);
      if (!state) {
        state = {
          id: row.stateId,
          name: row.stateName,
          slug: row.stateSlug,
          cities: [],
          citiesMap: new Map(),
        };
        stateMap.set(row.stateId, state);
      }

      let city = state.citiesMap.get(row.cityId);
      if (!city) {
        city = {
          id: row.cityId,
          name: row.cityName,
          slug: row.citySlug,
          neighborhoods: [],
        };
        state.citiesMap.set(row.cityId, city);
        state.cities.push(city);
      }

      city.neighborhoods.push({
        id: row.neighborhoodId,
        name: row.neighborhoodName,
        slug: row.neighborhoodSlug,
      });
    }

    const states = [...stateMap.values()].map(({ citiesMap: _m, ...s }) => s);
    return [
      {
        id: country.id,
        name: country.name,
        slug: country.slug,
        states,
      },
    ];
  }
}
