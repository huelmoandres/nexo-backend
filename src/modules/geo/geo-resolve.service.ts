import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { GeoEntitySource } from '@prisma/client';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { buildProblem } from '@common/errors/problem.factory';
import { geoConfig } from '@config/geo.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import { slugifyGeo } from './lib/slugify-geo';
import { GeoRepository } from './geo.repository';
import {
  GEOCODING_PROVIDER_TOKEN,
  type GeocodingResult,
  type IGeocodingProvider,
} from './providers/geocoding.types';
import type { GeoResolveRequestDto } from './dto/geo-resolve-request.dto';
import type { GeoResolveResponseDto } from './dto/geo-resolve-response.dto';

@Injectable()
export class GeoResolveService {
  constructor(
    private readonly geoRepository: GeoRepository,
    @Inject(GEOCODING_PROVIDER_TOKEN)
    private readonly geocoding: IGeocodingProvider,
    @Inject(REDIS_AUTH_CLIENT)
    private readonly redis: Redis,
    @Inject(geoConfig.KEY)
    private readonly cfg: ConfigType<typeof geoConfig>,
  ) {}

  async resolve(dto: GeoResolveRequestDto): Promise<GeoResolveResponseDto> {
    this.assertHasInput(dto);

    const cacheKey = this.buildCacheKey(dto);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GeoResolveResponseDto;
    }

    let geocoded: GeocodingResult | null = null;
    if (dto.addressLine?.trim()) {
      geocoded = await this.geocoding.forwardGeocode(dto.addressLine.trim());
    } else {
      geocoded = await this.geocoding.reverseGeocode(
        dto.latitude!,
        dto.longitude!,
      );
    }

    const lat =
      dto.preferCoordinates &&
      dto.latitude !== undefined &&
      dto.longitude !== undefined
        ? dto.latitude
        : (geocoded?.latitude ?? dto.latitude);
    const lng =
      dto.preferCoordinates &&
      dto.latitude !== undefined &&
      dto.longitude !== undefined
        ? dto.longitude
        : (geocoded?.longitude ?? dto.longitude);

    const outputCoords = this.toOutputCoords(lat, lng, geocoded);

    if (!geocoded) {
      const response: GeoResolveResponseDto = {
        resolved: false,
        latitude: outputCoords.latitude,
        longitude: outputCoords.longitude,
        formattedAddress: dto.addressLine?.trim() ?? null,
        geo: null,
        reason: 'NOT_FOUND',
        created: { city: false, neighborhood: false },
        source: null,
      };
      await this.cacheResolve(cacheKey, response);
      return response;
    }

    const country = await this.geoRepository.findCountryByIso(
      this.cfg.countryIsoCode,
    );
    if (!country) {
      const response: GeoResolveResponseDto = {
        resolved: false,
        latitude: outputCoords.latitude,
        longitude: outputCoords.longitude,
        formattedAddress: geocoded.formattedAddress,
        geo: null,
        reason: 'NOT_FOUND',
        created: { city: false, neighborhood: false },
        source: null,
      };
      await this.cacheResolve(cacheKey, response);
      return response;
    }

    const parsed = this.parseComponents(geocoded);
    const created = { city: false, neighborhood: false };

    let state = parsed.stateName
      ? await this.geoRepository.findStateByCountryAndSlug(
          country.id,
          slugifyGeo(parsed.stateName),
        )
      : null;

    if (!state && parsed.stateName) {
      state = await this.geoRepository.upsertState({
        countryId: country.id,
        name: parsed.stateName,
        slug: slugifyGeo(parsed.stateName),
        source: GeoEntitySource.GOOGLE,
        externalId: geocoded.placeId,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
      });
    }

    if (!state) {
      const response: GeoResolveResponseDto = {
        resolved: false,
        latitude: outputCoords.latitude,
        longitude: outputCoords.longitude,
        formattedAddress: geocoded.formattedAddress,
        geo: null,
        reason: 'INCOMPLETE_COMPONENTS',
        created,
        source: 'google',
      };
      await this.cacheResolve(cacheKey, response);
      return response;
    }

    let city = parsed.cityName
      ? await this.geoRepository.findCityByStateAndSlug(
          state.id,
          slugifyGeo(parsed.cityName),
        )
      : null;

    if (!city && parsed.cityName) {
      city = await this.geoRepository.upsertCity({
        stateId: state.id,
        name: parsed.cityName,
        slug: slugifyGeo(parsed.cityName),
        source: GeoEntitySource.GOOGLE,
        externalId: geocoded.placeId,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
      });
      created.city = true;
    }

    let neighborhoodId: string | null = null;
    if (city && parsed.neighborhoodName) {
      let neighborhood = await this.geoRepository.findNeighborhoodByCityAndSlug(
        city.id,
        slugifyGeo(parsed.neighborhoodName),
      );
      if (!neighborhood) {
        neighborhood = await this.geoRepository.upsertNeighborhood({
          cityId: city.id,
          name: parsed.neighborhoodName,
          slug: slugifyGeo(parsed.neighborhoodName),
          source: GeoEntitySource.GOOGLE,
          externalId: geocoded.placeId,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        });
        created.neighborhood = true;
      }
      neighborhoodId = neighborhood.id;
    }

    const response: GeoResolveResponseDto = {
      resolved: true,
      latitude: outputCoords.latitude,
      longitude: outputCoords.longitude,
      formattedAddress: geocoded.formattedAddress,
      geo: {
        countryId: country.id,
        stateId: state.id,
        cityId: city?.id ?? null,
        neighborhoodId,
      },
      created,
      source: 'google',
    };

    await this.cacheResolve(cacheKey, response);
    if (created.city || created.neighborhood) {
      await this.redis.del(this.cfg.cacheKeyTree);
    }
    return response;
  }

  private assertHasInput(dto: GeoResolveRequestDto): void {
    const hasAddress = Boolean(dto.addressLine?.trim());
    const hasCoords = dto.latitude !== undefined && dto.longitude !== undefined;
    if (!hasAddress && !hasCoords) {
      throw new BadRequestException(
        buildProblem(
          'GEO_RESOLVE_INPUT_REQUIRED',
          'Indica addressLine o latitude y longitude.',
        ),
      );
    }
  }

  private buildCacheKey(dto: GeoResolveRequestDto): string {
    const payload = JSON.stringify({
      a: dto.addressLine?.trim().toLowerCase() ?? '',
      lat: dto.latitude,
      lng: dto.longitude,
      p: dto.preferCoordinates ?? false,
    });
    const hash = createHash('sha256').update(payload).digest('hex');
    return `${this.cfg.resolveCachePrefix}${hash}`;
  }

  private async cacheResolve(
    key: string,
    response: GeoResolveResponseDto,
  ): Promise<void> {
    try {
      await this.redis.setex(
        key,
        this.cfg.resolveCacheTtlSeconds,
        JSON.stringify(response),
      );
    } catch {
      /* cache opcional */
    }
  }

  private toOutputCoords(
    lat: number | undefined,
    lng: number | undefined,
    geocoded: GeocodingResult | null,
  ): { latitude: number | null; longitude: number | null } {
    return {
      latitude: lat ?? geocoded?.latitude ?? null,
      longitude: lng ?? geocoded?.longitude ?? null,
    };
  }

  private parseComponents(result: GeocodingResult): {
    stateName?: string;
    cityName?: string;
    neighborhoodName?: string;
  } {
    const find = (...types: string[]) =>
      result.components.find((c) => types.some((t) => c.types.includes(t)))
        ?.longName;

    const stateName = find('administrative_area_level_1');
    const cityName =
      find('locality') ??
      find('administrative_area_level_2') ??
      find('administrative_area_level_3');
    const neighborhoodName =
      find('neighborhood') ??
      find('sublocality', 'sublocality_level_1') ??
      find('sublocality_level_2');

    return { stateName, cityName, neighborhoodName };
  }
}
