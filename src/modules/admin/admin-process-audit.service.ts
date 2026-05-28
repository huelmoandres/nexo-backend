import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import type { ListProcessAuditQueryDto } from './dto/list-process-audit-query.dto';
import type { ListProcessAuditResponseDto } from './dto/process-audit-item.dto';

@Injectable()
export class AdminProcessAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListProcessAuditQueryDto,
  ): Promise<ListProcessAuditResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProcessAuditWhereInput = {};
    if (query.domain) {
      where.domain = query.domain;
    }
    if (query.operation) {
      where.operation = { contains: query.operation };
    }
    if (query.outcome) {
      where.outcome = query.outcome;
    }
    if (query.correlationId) {
      where.correlationId = query.correlationId;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.processAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          correlationId: true,
          domain: true,
          operation: true,
          outcome: true,
          source: true,
          severity: true,
          entityId: true,
          externalRef: true,
          problemCode: true,
          errorMessage: true,
          durationMs: true,
          createdAt: true,
        },
      }),
      this.prisma.processAudit.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
