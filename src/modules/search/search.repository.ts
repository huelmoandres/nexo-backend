import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import type { SearchResultDto } from './dto/search-result.dto';

export interface SearchFilters {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  categoryId?: string;
  q?: string;
  limit: number;
  offset: number;
  /**
   * Diccionario PostgreSQL para Full Text Search.
   * Inyectado desde searchConfig para permitir configuración por entorno.
   */
  ftsDictionary: string;
}

/** Fila raw devuelta por Postgres para la query de búsqueda. */
interface SearchRow {
  id: string;
  userId: string;
  fullName: string;
  bio: string | null;
  experienceYears: number | null;
  averageRating: number;
  isAvailable: boolean;
  distance_m: number;
}

/** Fila raw para el COUNT (total de resultados sin paginar). */
interface CountRow {
  total: bigint;
}

/**
 * Persistencia de búsqueda geoespacial.
 *
 * Estrategia de rendimiento:
 * 1. ST_DWithin sobre índice GiST — descarta la mayoría de filas sin scan completo.
 * 2. Filtro categoryId via EXISTS — evita duplicados por N-N.
 * 3. FTS (to_tsvector 'spanish') como ÚLTIMO filtro — solo sobre sobrevivientes del radio.
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
   * Construye el SQL y el array de parámetros dinámicamente.
   * El índice de cada parámetro ($N) se incrementa en orden de inserción.
   *
   * @param mode - 'results' devuelve columnas + ORDER BY + LIMIT/OFFSET.
   *               'count'   devuelve COUNT(*) sin ORDER BY ni paginación.
   */
  private buildQuery(
    filters: SearchFilters,
    mode: 'results' | 'count',
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];

    // Parámetros fijos (posiciones $1, $2, $3)
    params.push(filters.longitude); // $1
    params.push(filters.latitude); // $2
    params.push(filters.radiusMeters); // $3

    let paramIdx = 4;

    // Cláusula JOIN opcional para categoryId
    let categoryJoin = '';
    let categoryFilter = '';
    if (filters.categoryId) {
      params.push(filters.categoryId); // $4
      categoryJoin = `
        JOIN "ProfessionalCategory" pc
          ON pc."professionalId" = pp.id AND pc."categoryId" = $${paramIdx}`;
      categoryFilter = `AND pc."categoryId" IS NOT NULL`;
      paramIdx++;
    }

    // Cláusula FTS opcional — ÚLTIMA en el WHERE para que PostGIS filtre primero
    let ftsFilter = '';
    if (filters.q) {
      params.push(filters.q); // $4 o $5
      const dict = filters.ftsDictionary;
      ftsFilter = `
        AND (
          to_tsvector('${dict}', COALESCE(u."fullName", '') || ' ' || COALESCE(pp.bio, ''))
          @@ plainto_tsquery('${dict}', $${paramIdx})
        )`;
      paramIdx++;
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
          ${ftsFilter}
      `;
      return { sql, params };
    }

    // mode === 'results'
    params.push(filters.limit); // $N
    params.push(filters.offset); // $N+1

    const sql = `
      SELECT
        pp.id,
        u.id            AS "userId",
        u."fullName",
        pp.bio,
        pp."experienceYears",
        pp."averageRating",
        pp."isAvailable",
        ST_Distance(pp.location, ${basePoint}) AS distance_m
      FROM "ProfessionalProfile" pp
      JOIN "User" u ON u.id = pp."userId"
      ${categoryJoin}
      WHERE
        pp."deletedAt" IS NULL
        AND u."deletedAt"  IS NULL
        AND pp."isAvailable" = true
        AND ST_DWithin(pp.location, ${basePoint}, $3)
        ${categoryFilter}
        ${ftsFilter}
      ORDER BY distance_m ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    return { sql, params };
  }
}
