import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import type { SearchResultDto } from './dto/search-result.dto';

export interface SearchFilters {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  categoryId?: string;
  q?: string;
  /** Términos expandidos por IA (incluye original). Undefined = sin FTS. */
  expandedTerms?: string[];
  limit: number;
  offset: number;
  ftsDictionary: string;
  /** Umbral de word_similarity para fallback pg_trgm (0-1). */
  trgmThreshold: number;
}

interface SearchRow {
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

interface CountRow {
  total: bigint;
}

/**
 * Persistencia de búsqueda geoespacial.
 *
 * Estrategia de rendimiento:
 * 1. ST_DWithin sobre índice GiST — descarta la mayoría de filas sin scan completo.
 * 2. Filtro categoryId via JOIN — evita duplicados por N-N.
 * 3. FTS + pg_trgm como ÚLTIMO filtro — solo sobre sobrevivientes del radio.
 *
 * El vector de texto incluye nombre, bio y nombres de categorías del profesional,
 * permitiendo buscar por categoría vía texto libre ("electricista" matchea
 * categoría "Electricidad" si la expansión IA lo incluye).
 *
 * Seguridad: todos los parámetros se pasan como $N posicionales.
 * NUNCA se concatena input del usuario en el string SQL.
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProfessionals(filters: SearchFilters): Promise<SearchResultDto[]> {
    const { sql, params } = this.buildQuery(filters, 'results');
    const rows = await this.prisma.$queryRawUnsafe<SearchRow[]>(sql, ...params);

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      bio: row.bio,
      experienceYears:
        row.experienceYears !== null ? Number(row.experienceYears) : null,
      averageRating: Number(row.averageRating),
      isAvailable: row.isAvailable,
      distanceMeters: Number(row.distance_m),
    }));
  }

  async countProfessionals(filters: SearchFilters): Promise<number> {
    const { sql, params } = this.buildQuery(filters, 'count');
    const rows = await this.prisma.$queryRawUnsafe<CountRow[]>(sql, ...params);
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Texto de búsqueda concatenado: nombre + bio + nombres de categorías.
   * Usado tanto para FTS como para pg_trgm.
   */
  private searchTextExpr(): string {
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

  private buildQuery(
    filters: SearchFilters,
    mode: 'results' | 'count',
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];

    params.push(filters.longitude); // $1
    params.push(filters.latitude); // $2
    params.push(filters.radiusMeters); // $3

    let paramIdx = 4;

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

    const searchText = this.searchTextExpr();
    const dict = filters.ftsDictionary;

    let textFilter = '';
    let relevanceExpr = '0';
    const hasText =
      filters.expandedTerms && filters.expandedTerms.length > 0;

    if (hasText) {
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
          OR word_similarity($${qOrigIdx}, ${searchText}) > $${threshIdx}
        )`;

      relevanceExpr = `
        CASE WHEN to_tsvector('${dict}', ${searchText}) @@ (${combinedTsquery})
             THEN 0 ELSE 1 END`;
    }

    const basePoint = `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`;

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
          AND ST_DWithin(pp.location, ${basePoint}, $3)
          ${categoryFilter}
          ${textFilter}
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
        ST_Distance(pp.location, ${basePoint}) AS distance_m,
        ${relevanceExpr} AS relevance_rank
      FROM "ProfessionalProfile" pp
      JOIN "User" u ON u.id = pp."userId"
      ${categoryJoin}
      WHERE
        pp."deletedAt" IS NULL
        AND u."deletedAt"  IS NULL
        AND pp."isAvailable" = true
        AND ST_DWithin(pp.location, ${basePoint}, $3)
        ${categoryFilter}
        ${textFilter}
      ORDER BY relevance_rank ASC, distance_m ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    return { sql, params };
  }
}
