import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { googleMapsConfig } from '@config/google-maps.config';
import type {
  GeocodingResult,
  GeocodingAddressComponent,
  IGeocodingProvider,
} from './geocoding.types';

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    formatted_address: string;
    place_id: string;
    types?: string[];
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
}

@Injectable()
export class GoogleGeocodingProvider implements IGeocodingProvider {
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(
    @Inject(googleMapsConfig.KEY)
    private readonly cfg: ConfigType<typeof googleMapsConfig>,
  ) {}

  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<GeocodingResult | null> {
    if (!this.cfg.enabled) {
      return null;
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', this.cfg.apiKey);
    url.searchParams.set('region', this.cfg.region);
    url.searchParams.set('language', this.cfg.language);
    url.searchParams.set(
      'result_type',
      'street_address|route|locality|sublocality|neighborhood',
    );
    return this.fetchReverse(url);
  }

  async forwardGeocode(address: string): Promise<GeocodingResult | null> {
    if (!this.cfg.enabled) {
      return null;
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('components', 'country:UY');
    url.searchParams.set('key', this.cfg.apiKey);
    url.searchParams.set('region', this.cfg.region);
    url.searchParams.set('language', this.cfg.language);
    return this.fetch(url);
  }

  async geocodePlaceId(placeId: string): Promise<GeocodingResult | null> {
    if (!this.cfg.enabled) {
      return null;
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('place_id', placeId.trim());
    url.searchParams.set('key', this.cfg.apiKey);
    url.searchParams.set('region', this.cfg.region);
    url.searchParams.set('language', this.cfg.language);
    return this.fetch(url);
  }

  private async fetchReverse(url: URL): Promise<GeocodingResult | null> {
    const data = await this.fetchRaw(url);
    if (!data?.results?.length) return null;
    return this.mergeReverseResults(data.results);
  }

  private async fetch(url: URL): Promise<GeocodingResult | null> {
    const data = await this.fetchRaw(url);
    if (!data?.results?.length) return null;
    return this.mapResult(data.results[0]);
  }

  private async fetchRaw(url: URL): Promise<GoogleGeocodeResponse | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn({ op: 'geo.google.httpError', status: res.status });
        return null;
      }
      const data = (await res.json()) as GoogleGeocodeResponse;
      if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
        return null;
      }
      if (data.status !== 'OK') {
        this.logger.warn({ op: 'geo.google.status', status: data.status });
        return null;
      }
      const first = data.results[0];
      const country = first.address_components.find((c) =>
        c.types.includes('country'),
      );
      if (country?.short_name !== 'UY') {
        return null;
      }
      return data;
    } catch (err) {
      this.logger.warn({
        op: 'geo.google.fetchFailed',
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reverse: calle en results[0]; barrio suele venir en otro result (ej. Pocitos en Montevideo). */
  private mergeReverseResults(
    results: NonNullable<GoogleGeocodeResponse['results']>,
  ): GeocodingResult {
    const primary =
      results.find((r) => r.types?.includes('street_address')) ??
      results.find((r) => r.types?.includes('route')) ??
      results[0];

    const merged = this.mapResult(primary);

    for (const row of results) {
      for (const component of row.address_components) {
        if (component.types.includes('neighborhood')) {
          this.appendComponentIfMissing(merged, component);
        }
      }
    }

    if (!merged.components.some((c) => c.types.includes('neighborhood'))) {
      for (const row of results) {
        for (const component of row.address_components) {
          if (
            component.types.includes('sublocality_level_1') ||
            component.types.includes('sublocality')
          ) {
            this.appendComponentIfMissing(merged, component);
            break;
          }
        }
      }
    }

    return merged;
  }

  private appendComponentIfMissing(
    merged: GeocodingResult,
    component: {
      long_name: string;
      short_name: string;
      types: string[];
    },
  ): void {
    const exists = merged.components.some(
      (c) =>
        c.longName === component.long_name &&
        c.types.some((t) => component.types.includes(t)),
    );
    if (exists) return;
    merged.components.push({
      longName: component.long_name,
      shortName: component.short_name,
      types: component.types,
    });
  }

  private mapResult(
    row: NonNullable<GoogleGeocodeResponse['results']>[number],
  ): GeocodingResult {
    const components: GeocodingAddressComponent[] = row.address_components.map(
      (c) => ({
        longName: c.long_name,
        shortName: c.short_name,
        types: c.types,
      }),
    );
    return {
      latitude: row.geometry.location.lat,
      longitude: row.geometry.location.lng,
      formattedAddress: row.formatted_address,
      placeId: row.place_id,
      components,
    };
  }
}
