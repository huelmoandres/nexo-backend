import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

export interface BusinessAuditInput {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousState?: string;
  newState?: string;
  metadata?: Prisma.InputJsonValue;
  companyId?: string;
  escrowTransactionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

type TxClient = Prisma.TransactionClient;

@Injectable()
export class BusinessAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: BusinessAuditInput, tx?: TxClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        previousState: input.previousState ?? null,
        newState: input.newState ?? null,
        metadata: input.metadata,
        companyId: input.companyId ?? null,
        escrowTransactionId: input.escrowTransactionId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
