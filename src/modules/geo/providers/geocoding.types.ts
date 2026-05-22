export const GEOCODING_PROVIDER_TOKEN = Symbol('GEOCODING_PROVIDER_TOKEN');

export interface GeocodingAddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
  components: GeocodingAddressComponent[];
}

export interface IGeocodingProvider {
  reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null>;
  forwardGeocode(address: string): Promise<GeocodingResult | null>;
}
