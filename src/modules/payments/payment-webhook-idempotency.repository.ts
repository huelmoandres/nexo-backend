import { Injectable } from '@nestjs/common';
import { PaymentWebhookIdempotencyStatus } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

export type WebhookIdempotencyBeginResult = 'new' | 'completed' | 'in_progress';

@Injectable()
export class PaymentWebhookIdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async begin(input: {
    idempotencyKey: string;
    provider: string;
    operation: string;
    externalRef?: string;
    jobId?: string;
    providerReference?: string;
    staleProcessingMs: number;
  }): Promise<WebhookIdempotencyBeginResult> {
    const existing = await this.prisma.paymentWebhookIdempotency.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing?.status === PaymentWebhookIdempotencyStatus.COMPLETED) {
      return 'completed';
    }

    if (existing?.status === PaymentWebhookIdempotencyStatus.PROCESSING) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      if (ageMs < input.staleProcessingMs) {
        return 'in_progress';
      }
      await this.prisma.paymentWebhookIdempotency.delete({
        where: { idempotencyKey: input.idempotencyKey },
      });
    } else if (existing) {
      await this.prisma.paymentWebhookIdempotency.delete({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }

    try {
      await this.prisma.paymentWebhookIdempotency.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          provider: input.provider,
          operation: input.operation,
          status: PaymentWebhookIdempotencyStatus.PROCESSING,
          externalRef: input.externalRef,
          jobId: input.jobId,
          providerReference: input.providerReference,
        },
      });
      return 'new';
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        return this.begin(input);
      }
      throw err;
    }
  }

  async complete(
    idempotencyKey: string,
    outcomeSummary?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.paymentWebhookIdempotency.update({
      where: { idempotencyKey },
      data: {
        status: PaymentWebhookIdempotencyStatus.COMPLETED,
        processedAt: new Date(),
        ...(outcomeSummary != null
          ? { outcomeSummary: outcomeSummary as object }
          : {}),
      },
    });
  }

  async abandon(idempotencyKey: string): Promise<void> {
    await this.prisma.paymentWebhookIdempotency.deleteMany({
      where: {
        idempotencyKey,
        status: PaymentWebhookIdempotencyStatus.PROCESSING,
      },
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}
