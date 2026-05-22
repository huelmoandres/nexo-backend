import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@modules/auth/auth.module';
import { geoConfig } from '@config/geo.config';
import { googleMapsConfig } from '@config/google-maps.config';
import { GeoController } from './geo.controller';
import { GeoRepository } from './geo.repository';
import { GeoResolveService } from './geo-resolve.service';
import { GeoService } from './geo.service';
import { GoogleGeocodingProvider } from './providers/google-geocoding.provider';
import { GEOCODING_PROVIDER_TOKEN } from './providers/geocoding.types';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forFeature(geoConfig),
    ConfigModule.forFeature(googleMapsConfig),
  ],
  controllers: [GeoController],
  providers: [
    GeoService,
    GeoResolveService,
    GeoRepository,
    GoogleGeocodingProvider,
    {
      provide: GEOCODING_PROVIDER_TOKEN,
      useExisting: GoogleGeocodingProvider,
    },
  ],
  exports: [GeoService, GeoResolveService],
})
export class GeoModule {}
