import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { GeoEntitySource, type City, type State } from '@prisma/client';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { buildProblem } from '@common/errors/problem.factory';
import { geoConfig } from '@config/geo.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import { slugifyGeo } from './lib/slugify-geo';
import {
  isImSectionalCode,
  normalizeGeoNameForCompare,
} from './lib/geo-name-match';
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

    if (
      dto.latitude !== undefined &&
      dto.longitude !== undefined &&
      !this.isInsideUruguayBounds(dto.latitude, dto.longitude)
    ) {
      return this.buildOutsideUruguayResponse(dto);
    }

    const cacheKey = this.buildCacheKey(dto);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GeoResolveResponseDto;
    }

    let geocoded: GeocodingResult | null = null;
    const placeId = dto.placeId?.trim();
    if (placeId) {
      geocoded = await this.geocoding.geocodePlaceId(placeId);
    } else if (dto.addressLine?.trim()) {
      geocoded = await this.geocoding.forwardGeocode(dto.addressLine.trim());
    } else {
      geocoded = await this.geocoding.reverseGeocode(
        dto.latitude!,
        dto.longitude!,
      );
    }

    if (
      geocoded &&
      !this.isInsideUruguayBounds(geocoded.latitude, geocoded.longitude)
    ) {
      const response = this.buildOutsideUruguayResponse(dto, geocoded);
      await this.cacheResolve(cacheKey, response);
      return response;
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
        parsed: null,
        placeId: placeId ?? null,
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
        parsed: this.toParsedDto(this.parseComponents(geocoded)),
        placeId: this.outputPlaceId(placeId, geocoded),
      };
      await this.cacheResolve(cacheKey, response);
      return response;
    }

    const parsed = this.parseComponents(geocoded);
    const parsedDto = this.toParsedDto(parsed);
    const created = { city: false, neighborhood: false };

    const anchored = await this.resolveAnchoredEntities(dto, country.id, parsed);
    let state = anchored.state;
    let city = anchored.city;

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
        parsed: parsedDto,
        placeId: this.outputPlaceId(placeId, geocoded),
      };
      await this.cacheResolve(cacheKey, response);
      return response;
    }

    const neighborhoodId = city
      ? await this.resolveNeighborhoodId(
          city,
          parsed.neighborhoodName,
          geocoded,
          created,
        )
      : null;

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
      parsed: parsedDto,
      placeId: this.outputPlaceId(placeId, geocoded),
    };

    await this.cacheResolve(cacheKey, response);
    if (created.neighborhood) {
      await this.redis.del(this.cfg.cacheKeyTree);
    }
    return response;
  }

  /**
   * Barrio solo si matchea catálogo o la ciudad admite barrios dinámicos (capital).
   * En localidades como La Paloma (Rocha), Google suele devolver sublocality/neighborhood
   * con el mismo nombre que la ciudad — no se persiste como barrio.
   */
  private async resolveNeighborhoodId(
    city: City,
    neighborhoodHint: string | undefined,
    geocoded: GeocodingResult,
    created: { neighborhood: boolean },
  ): Promise<string | null> {
    const hint = neighborhoodHint?.trim();
    if (!hint) return null;

    if (
      normalizeGeoNameForCompare(hint) === normalizeGeoNameForCompare(city.name)
    ) {
      return null;
    }

    const existing =
      await this.geoRepository.findNeighborhoodByCityAndParsedName(
        city.id,
        hint,
      );
    if (existing) return existing.id;

    if (!(await this.canUpsertNeighborhoodFromGoogle(city))) {
      return null;
    }

    const neighborhood = await this.geoRepository.upsertNeighborhood({
      cityId: city.id,
      name: hint,
      slug: slugifyGeo(hint),
      source: GeoEntitySource.GOOGLE,
      externalId: geocoded.placeId,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
    });
    created.neighborhood = true;
    return neighborhood.id;
  }

  private async canUpsertNeighborhoodFromGoogle(city: City): Promise<boolean> {
    const neighborhoods =
      await this.geoRepository.findNeighborhoodsByCityId(city.id);
    if (neighborhoods.length <= 1) return false;
    return neighborhoods.some((n) => n.slug !== 'centro');
  }

  private outputPlaceId(
    requestPlaceId: string | undefined,
    geocoded: GeocodingResult | null,
  ): string | null {
    return requestPlaceId?.trim() ?? geocoded?.placeId ?? null;
  }

  /** Hints de UI no deben pisar un placeId, dirección nueva o pin movido lejos. */
  private shouldIgnoreUiGeoHints(dto: GeoResolveRequestDto): boolean {
    if (dto.placeId?.trim()) return true;
    if (dto.addressLine?.trim()) return true;
    if (
      dto.preferCoordinates &&
      dto.latitude !== undefined &&
      dto.longitude !== undefined
    ) {
      return true;
    }
    return false;
  }

  private async resolveAnchoredEntities(
    dto: GeoResolveRequestDto,
    countryId: string,
    parsed: ReturnType<GeoResolveService['parseComponents']>,
  ): Promise<{ state: State | null; city: City | null }> {
    let state: State | null = null;
    let city: City | null = null;

    const useHints = !this.shouldIgnoreUiGeoHints(dto);

    if (useHints && dto.cityId) {
      const hintCity = await this.geoRepository.findCityById(dto.cityId);
      if (hintCity?.state?.countryId === countryId) {
        city = hintCity;
        state = hintCity.state;
      }
    }

    if (useHints && dto.stateId) {
      const hintState = await this.geoRepository.findStateById(dto.stateId);
      if (hintState?.countryId === countryId) {
        if (!state) state = hintState;
      }
    }

    if (!state && parsed.stateName) {
      state = await this.geoRepository.findStateByCountryAndParsedName(
        countryId,
        parsed.stateName,
      );
    }

    if (!city && state && parsed.cityName) {
      city = await this.geoRepository.findCityByStateAndParsedName(
        state.id,
        parsed.cityName,
      );
    }

    return { state, city };
  }

  private isInsideUruguayBounds(lat: number, lng: number): boolean {
    const { minLat, maxLat, minLng, maxLng } = this.cfg.uruguayBounds;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  }

  private buildOutsideUruguayResponse(
    dto: GeoResolveRequestDto,
    geocoded?: GeocodingResult | null,
  ): GeoResolveResponseDto {
    return {
      resolved: false,
      latitude: null,
      longitude: null,
      formattedAddress: geocoded?.formattedAddress ?? dto.addressLine?.trim() ?? null,
      geo: null,
      reason: 'OUTSIDE_URUGUAY',
      created: { city: false, neighborhood: false },
      source: geocoded ? 'google' : null,
      parsed: geocoded ? this.toParsedDto(this.parseComponents(geocoded)) : null,
      placeId: this.outputPlaceId(dto.placeId, geocoded ?? null),
    };
  }

  private assertHasInput(dto: GeoResolveRequestDto): void {
    const hasPlaceId = Boolean(dto.placeId?.trim());
    const hasAddress = Boolean(dto.addressLine?.trim());
    const hasCoords = dto.latitude !== undefined && dto.longitude !== undefined;
    if (!hasPlaceId && !hasAddress && !hasCoords) {
      throw new BadRequestException(
        buildProblem(
          'GEO_RESOLVE_INPUT_REQUIRED',
          'Indica placeId, addressLine o latitude y longitude.',
        ),
      );
    }
  }

  private buildCacheKey(dto: GeoResolveRequestDto): string {
    const payload = JSON.stringify({
      pid: dto.placeId?.trim() ?? '',
      a: dto.addressLine?.trim().toLowerCase() ?? '',
      lat: dto.latitude,
      lng: dto.longitude,
      p: dto.preferCoordinates ?? false,
      s: dto.stateId ?? '',
      c: dto.cityId ?? '',
      n: dto.neighborhoodName?.trim().toLowerCase() ?? '',
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
    const locality = find('locality');
    const level2 = find('administrative_area_level_2');
    const level3 = find('administrative_area_level_3');
    const cityName =
      locality ??
      (level2 && !isImSectionalCode(level2) ? level2 : undefined) ??
      level3;

    let neighborhoodName =
      find('neighborhood') ??
      find('sublocality', 'sublocality_level_1') ??
      find('sublocality_level_2');
    if (neighborhoodName && isImSectionalCode(neighborhoodName)) {
      neighborhoodName = undefined;
    }

    return { stateName, cityName, neighborhoodName };
  }

  private toParsedDto(parsed: {
    stateName?: string;
    cityName?: string;
    neighborhoodName?: string;
  }) {
    return {
      stateName: parsed.stateName ?? null,
      cityName: parsed.cityName ?? null,
      neighborhoodName: parsed.neighborhoodName ?? null,
    };
  }
}
