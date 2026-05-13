import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CATEGORY_MAX_DEPTH } from '../ai.constants';

/**
 * Helper de matching jerárquico entre categorías.
 *
 * Regla: `isCategoryRelated(targetId, sourceId)` devuelve `true` si `source`
 * es igual a `target` o es un **ancestro** de `target` en el árbol de categorías
 * (usando la relación `parentId`). Esto permite que una categoría amplia
 * ("Construcción") valide ítems de categorías específicas ("Plomería").
 *
 * Limitación v1: recorrido ascendente en BD (un query por hop).
 * Documentar profundidad máxima CATEGORY_MAX_DEPTH para evitar picos de latencia.
 *
 * Evolución v2: añadir campo `path` materializado en la tabla Category
 * (ej. "1.4.12") para hacer el matching O(1) con comparación de strings.
 */
@Injectable()
export class CategoryMatcherService {
  private readonly logger = new Logger(CategoryMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve true si `sourceId` es igual a `targetId` o es un ancestro directo
   * de `targetId` en el árbol de categorías.
   *
   * @param targetId  Categoría del ítem de portfolio
   * @param sourceId  Categoría del Job referenciado (o criterio de validación)
   */
  async isCategoryRelated(
    targetId: string,
    sourceId: string,
  ): Promise<boolean> {
    if (targetId === sourceId) return true;

    let currentId: string | null = targetId;
    let depth = 0;

    while (currentId && depth < CATEGORY_MAX_DEPTH) {
      const cat: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });

      if (!cat) break;
      if (cat.parentId === sourceId) return true;

      currentId = cat.parentId;
      depth++;
    }

    if (depth >= CATEGORY_MAX_DEPTH) {
      this.logger.warn({
        op: 'ai.categoryMatcher.maxDepthReached',
        targetId,
        sourceId,
        maxDepth: CATEGORY_MAX_DEPTH,
      });
    }

    return false;
  }
}
