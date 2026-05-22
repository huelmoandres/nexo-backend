import { Injectable } from '@nestjs/common';
import { GeoEntitySource, Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

export interface GeoFlatRow {
  countryId: string;
  countryName: string;
  countrySlug: string;
  stateId: string;
  stateName: string;
  stateSlug: string;
  cityId: string;
  cityName: string;
  citySlug: string;
  neighborhoodId: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
}

@Injectable()
export class GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCountryByIso(isoCode: string) {
    return this.prisma.country.findFirst({ where: { isoCode } });
  }

  async findStatesByCountryId(countryId: string) {
    return this.prisma.state.findMany({
      where: { countryId },
      orderBy: { name: 'asc' },
    });
  }

  async findCitiesByStateId(stateId: string) {
    return this.prisma.city.findMany({
      where: { stateId },
      orderBy: { name: 'asc' },
    });
  }

  async findNeighborhoodsByCityId(cityId: string) {
    return this.prisma.neighborhood.findMany({
      where: { cityId },
      orderBy: { name: 'asc' },
    });
  }

  async findFlatHierarchyForCountry(countryId: string): Promise<GeoFlatRow[]> {
    return this.prisma.$queryRaw<GeoFlatRow[]>`
      SELECT
        c.id AS "countryId", c.name AS "countryName", c.slug AS "countrySlug",
        s.id AS "stateId", s.name AS "stateName", s.slug AS "stateSlug",
        ci.id AS "cityId", ci.name AS "cityName", ci.slug AS "citySlug",
        n.id AS "neighborhoodId", n.name AS "neighborhoodName", n.slug AS "neighborhoodSlug"
      FROM "Country" c
      JOIN "State" s ON s."countryId" = c.id
      JOIN "City" ci ON ci."stateId" = s.id
      JOIN "Neighborhood" n ON n."cityId" = ci.id
      WHERE c.id = ${countryId}
      ORDER BY s.name, ci.name, n.name`;
  }

  async findStateByCountryAndSlug(countryId: string, slug: string) {
    return this.prisma.state.findFirst({
      where: { countryId, slug },
    });
  }

  async findCityByStateAndSlug(stateId: string, slug: string) {
    return this.prisma.city.findFirst({
      where: { stateId, slug },
    });
  }

  async findNeighborhoodByCityAndSlug(cityId: string, slug: string) {
    return this.prisma.neighborhood.findFirst({
      where: { cityId, slug },
    });
  }

  async upsertState(input: {
    countryId: string;
    name: string;
    slug: string;
    iso3166_2?: string;
    latitude?: number;
    longitude?: number;
    source: GeoEntitySource;
    externalId?: string;
  }) {
    return this.prisma.state.upsert({
      where: {
        countryId_slug: { countryId: input.countryId, slug: input.slug },
      },
      update: {
        name: input.name,
        iso3166_2: input.iso3166_2,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
      create: {
        countryId: input.countryId,
        name: input.name,
        slug: input.slug,
        iso3166_2: input.iso3166_2,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
    });
  }

  async upsertCity(input: {
    stateId: string;
    name: string;
    slug: string;
    latitude?: number;
    longitude?: number;
    source: GeoEntitySource;
    externalId?: string;
  }) {
    return this.prisma.city.upsert({
      where: {
        stateId_slug: { stateId: input.stateId, slug: input.slug },
      },
      update: {
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
      create: {
        stateId: input.stateId,
        name: input.name,
        slug: input.slug,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
    });
  }

  async upsertNeighborhood(input: {
    cityId: string;
    name: string;
    slug: string;
    latitude?: number;
    longitude?: number;
    source: GeoEntitySource;
    externalId?: string;
  }) {
    return this.prisma.neighborhood.upsert({
      where: {
        cityId_slug: { cityId: input.cityId, slug: input.slug },
      },
      update: {
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
      create: {
        cityId: input.cityId,
        name: input.name,
        slug: input.slug,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        externalId: input.externalId,
      },
    });
  }

  async searchByName(
    countryId: string,
    q: string,
    limit: number,
  ): Promise<
    Array<{
      level: 'state' | 'city' | 'neighborhood';
      id: string;
      name: string;
      slug: string;
      stateId?: string;
      cityId?: string;
    }>
  > {
    const states = await this.prisma.state.findMany({
      where: { countryId, name: { contains: q, mode: 'insensitive' } },
      take: limit,
      select: { id: true, name: true, slug: true },
    });
    const cities = await this.prisma.city.findMany({
      where: {
        state: { countryId },
        name: { contains: q, mode: 'insensitive' },
      },
      take: limit,
      select: { id: true, name: true, slug: true, stateId: true },
    });
    const neighborhoods = await this.prisma.neighborhood.findMany({
      where: {
        city: { state: { countryId } },
        name: { contains: q, mode: 'insensitive' },
      },
      take: limit,
      select: { id: true, name: true, slug: true, cityId: true },
    });
    return [
      ...states.map((s) => ({
        level: 'state' as const,
        id: s.id,
        name: s.name,
        slug: s.slug,
      })),
      ...cities.map((c) => ({
        level: 'city' as const,
        id: c.id,
        name: c.name,
        slug: c.slug,
        stateId: c.stateId,
      })),
      ...neighborhoods.map((n) => ({
        level: 'neighborhood' as const,
        id: n.id,
        name: n.name,
        slug: n.slug,
        cityId: n.cityId,
      })),
    ].slice(0, limit);
  }
}
