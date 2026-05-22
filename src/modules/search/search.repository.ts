import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import type { SearchResultDto } from './dto/search-result.dto';

export interface SearchFilters {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  categoryId?: string;
  q?: string;
  expandedTerms?: string[];
  limit: number;
  offset: number;
  ftsDictionary: string;
  trgmThreshold: number;
}

interface ProfessionalSearchRow {
  id: string;
  userId: string;
  fullName: string;
  bio: string | null;
  experienceYears: number | null;
  averageRating: number;
  isAvailable: boolean;
  distance_m: number;
  relevance_rank: number;
}

interface CompanySearchRow {
  id: string;
  name: string;
  bio: string | null;
  averageRating: number;
  isAvailable: boolean;
  distance_m: number;
  relevance_rank: number;
}

interface CountRow {
  total: bigint;
}

type SubjectKind = 'professional' | 'company';

/**
 * Persistencia de búsqueda geoespacial (profesionales y empresas).
 *
 * Geolocalización vía ServiceArea: el sujeto aparece si alguna zona cubre el punto
 * del usuario (ST_DWithin al radio de la zona). La distancia es al centro de la
 * zona más cercana, filtrada además por el radio máximo del cliente.
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProfessionals(filters: SearchFilters): Promise<SearchResultDto[]> {
    const { sql, params } = this.buildProfessionalQuery(filters, 'results');
    const rows = await this.prisma.$queryRawUnsafe<ProfessionalSearchRow[]>(
      sql,
      ...params,
    );
    return rows.map((row) => this.mapProfessionalRow(row));
  }

  async countProfessionals(filters: SearchFilters): Promise<number> {
    const { sql, params } = this.buildProfessionalQuery(filters, 'count');
    const rows = await this.prisma.$queryRawUnsafe<CountRow[]>(sql, ...params);
    return Number(rows[0]?.total ?? 0);
  }

  async findCompanies(filters: SearchFilters): Promise<SearchResultDto[]> {
    const { sql, params } = this.buildCompanyQuery(filters, 'results');
    const rows = await this.prisma.$queryRawUnsafe<CompanySearchRow[]>(
      sql,
      ...params,
    );
    return rows.map((row) => this.mapCompanyRow(row));
  }

  async countCompanies(filters: SearchFilters): Promise<number> {
    const { sql, params } = this.buildCompanyQuery(filters, 'count');
    const rows = await this.prisma.$queryRawUnsafe<CountRow[]>(sql, ...params);
    return Number(rows[0]?.total ?? 0);
  }

  private mapProfessionalRow(row: ProfessionalSearchRow): SearchResultDto {
    return {
      type: 'professional',
      id: row.id,
      name: row.fullName,
      bio: row.bio,
      averageRating: Number(row.averageRating),
      isAvailable: row.isAvailable,
      distanceMeters: Number(row.distance_m),
      userId: row.userId,
      experienceYears:
        row.experienceYears !== null ? Number(row.experienceYears) : null,
    };
  }

  private mapCompanyRow(row: CompanySearchRow): SearchResultDto {
    return {
      type: 'company',
      id: row.id,
      name: row.name,
      bio: row.bio,
      averageRating: Number(row.averageRating),
      isAvailable: row.isAvailable,
      distanceMeters: Number(row.distance_m),
      logoUrl: null,
    };
  }

  private minDistanceSubquery(
    subject: SubjectKind,
    alias: string,
    basePoint: string,
  ): string {
    const fk =
      subject === 'professional'
        ? `"professionalProfileId" = ${alias}.id`
        : `"companyId" = ${alias}.id`;
    return `(
      SELECT MIN(ST_Distance(sa.location, ${basePoint}))
      FROM "ServiceArea" sa
      WHERE sa.${fk}
    )`;
  }

  private serviceAreaExistsClause(
    subject: SubjectKind,
    alias: string,
    basePoint: string,
  ): string {
    const fk =
      subject === 'professional'
        ? `"professionalProfileId" = ${alias}.id`
        : `"companyId" = ${alias}.id`;
    return `EXISTS (
      SELECT 1 FROM "ServiceArea" sa
      WHERE sa.${fk}
        AND ST_DWithin(sa.location, ${basePoint}, sa."radiusMeters")
    )`;
  }

  private professionalSearchTextExpr(): string {
    return `(
      COALESCE(u."fullName", '') || ' ' ||
      COALESCE(pp.bio, '') || ' ' ||
      COALESCE((
        SELECT string_agg(c.name, ' ')
        FROM "ProfessionalCategory" pc2
        JOIN "Category" c ON c.id = pc2."categoryId"
        WHERE pc2."professionalId" = pp.id
      ), '')
    )`;
  }

  private companySearchTextExpr(): string {
    return `(
      COALESCE(co.name, '') || ' ' ||
      COALESCE(co.bio, '') || ' ' ||
      COALESCE((
        SELECT string_agg(c.name, ' ')
        FROM "CompanyCategory" cc
        JOIN "Category" c ON c.id = cc."categoryId"
        WHERE cc."companyId" = co.id
      ), '')
    )`;
  }

  private buildTextFilter(
    searchText: string,
    filters: SearchFilters,
    startParamIdx: number,
  ): { textFilter: string; relevanceExpr: string; params: unknown[]; nextIdx: number } {
    const params: unknown[] = [];
    let paramIdx = startParamIdx;
    let textFilter = '';
    let relevanceExpr = '0';
    const hasText = filters.expandedTerms && filters.expandedTerms.length > 0;

    if (!hasText) {
      return { textFilter, relevanceExpr, params, nextIdx: paramIdx };
    }

    const dict = filters.ftsDictionary;
    const tsqueryParts: string[] = [];
    for (const term of filters.expandedTerms!) {
      params.push(term);
      tsqueryParts.push(`plainto_tsquery('${dict}', $${paramIdx})`);
      paramIdx++;
    }
    const combinedTsquery = tsqueryParts.join(' || ');

    params.push(filters.q ?? filters.expandedTerms![0]);
    const qOrigIdx = paramIdx;
    paramIdx++;

    params.push(filters.trgmThreshold);
    const threshIdx = paramIdx;
    paramIdx++;

    textFilter = `
      AND (
        to_tsvector('${dict}', ${searchText}) @@ (${combinedTsquery})
        OR word_similarity($${qOrigIdx}::text, ${searchText}) > $${threshIdx}
      )`;

    relevanceExpr = `
      CASE WHEN to_tsvector('${dict}', ${searchText}) @@ (${combinedTsquery})
           THEN 0 ELSE 1 END`;

    return { textFilter, relevanceExpr, params, nextIdx: paramIdx };
  }

  private buildProfessionalQuery(
    filters: SearchFilters,
    mode: 'results' | 'count',
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    params.push(filters.longitude);
    params.push(filters.latitude);
    params.push(filters.radiusMeters);

    let paramIdx = 4;
    const basePoint = `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`;
    const distanceExpr = `${this.minDistanceSubquery('professional', 'pp', basePoint)}`;
    const existsClause = this.serviceAreaExistsClause(
      'professional',
      'pp',
      basePoint,
    );

    let categoryJoin = '';
    let categoryFilter = '';
    if (filters.categoryId) {
      params.push(filters.categoryId);
      categoryJoin = `
        JOIN "ProfessionalCategory" pc
          ON pc."professionalId" = pp.id AND pc."categoryId" = $${paramIdx}`;
      categoryFilter = `AND pc."categoryId" IS NOT NULL`;
      paramIdx++;
    }

    const searchText = this.professionalSearchTextExpr();
    const text = this.buildTextFilter(searchText, filters, paramIdx);
    paramIdx = text.nextIdx;
    params.push(...text.params);

    const geoWhere = `
      AND ${existsClause}
      AND ${distanceExpr} <= $3`;

    if (mode === 'count') {
      const sql = `
        SELECT COUNT(*) AS total
        FROM "ProfessionalProfile" pp
        JOIN "User" u ON u.id = pp."userId"
        ${categoryJoin}
        WHERE
          pp."deletedAt" IS NULL
          AND u."deletedAt"  IS NULL
          AND pp."isAvailable" = true
          ${geoWhere}
          ${categoryFilter}
          ${text.textFilter}
      `;
      return { sql, params };
    }

    params.push(filters.limit);
    params.push(filters.offset);

    const sql = `
      SELECT
        pp.id,
        u.id            AS "userId",
        u."fullName",
        pp.bio,
        pp."experienceYears",
        pp."averageRating",
        pp."isAvailable",
        ${distanceExpr} AS distance_m,
        ${text.relevanceExpr} AS relevance_rank
      FROM "ProfessionalProfile" pp
      JOIN "User" u ON u.id = pp."userId"
      ${categoryJoin}
      WHERE
        pp."deletedAt" IS NULL
        AND u."deletedAt"  IS NULL
        AND pp."isAvailable" = true
        ${geoWhere}
        ${categoryFilter}
        ${text.textFilter}
      ORDER BY relevance_rank ASC, distance_m ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    return { sql, params };
  }

  private buildCompanyQuery(
    filters: SearchFilters,
    mode: 'results' | 'count',
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    params.push(filters.longitude);
    params.push(filters.latitude);
    params.push(filters.radiusMeters);

    let paramIdx = 4;
    const basePoint = `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`;
    const distanceExpr = `${this.minDistanceSubquery('company', 'co', basePoint)}`;
    const existsClause = this.serviceAreaExistsClause('company', 'co', basePoint);

    let categoryJoin = '';
    let categoryFilter = '';
    if (filters.categoryId) {
      params.push(filters.categoryId);
      categoryJoin = `
        JOIN "CompanyCategory" cc
          ON cc."companyId" = co.id AND cc."categoryId" = $${paramIdx}`;
      categoryFilter = `AND cc."categoryId" IS NOT NULL`;
      paramIdx++;
    }

    const searchText = this.companySearchTextExpr();
    const text = this.buildTextFilter(searchText, filters, paramIdx);
    paramIdx = text.nextIdx;
    params.push(...text.params);

    const geoWhere = `
      AND ${existsClause}
      AND ${distanceExpr} <= $3`;

    if (mode === 'count') {
      const sql = `
        SELECT COUNT(*) AS total
        FROM "Company" co
        ${categoryJoin}
        WHERE
          co."deletedAt" IS NULL
          AND co."isAvailable" = true
          ${geoWhere}
          ${categoryFilter}
          ${text.textFilter}
      `;
      return { sql, params };
    }

    params.push(filters.limit);
    params.push(filters.offset);

    const sql = `
      SELECT
        co.id,
        co.name,
        co.bio,
        co."averageRating",
        co."isAvailable",
        ${distanceExpr} AS distance_m,
        ${text.relevanceExpr} AS relevance_rank
      FROM "Company" co
      ${categoryJoin}
      WHERE
        co."deletedAt" IS NULL
        AND co."isAvailable" = true
        ${geoWhere}
        ${categoryFilter}
        ${text.textFilter}
      ORDER BY relevance_rank ASC, distance_m ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    return { sql, params };
  }
}
