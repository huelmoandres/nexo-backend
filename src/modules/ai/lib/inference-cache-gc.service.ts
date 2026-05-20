import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

/**
 * Purga periódica de filas expiradas en AiInferenceCache.
 * Ejecuta cada hora con un simple setInterval (no necesita BullMQ).
 */
@Injectable()
export class InferenceCacheGcService implements OnModuleInit {
  private readonly logger = new Logger(InferenceCacheGcService.name);
  private intervalRef?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const oneHour = 60 * 60 * 1000;
    this.intervalRef = setInterval(() => void this.purgeExpired(), oneHour);
  }

  onModuleDestroy(): void {
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  async purgeExpired(): Promise<number> {
    try {
      const { count } = await this.prisma.aiInferenceCache.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log({ op: 'ai.cache.gc', deletedRows: count });
      }
      return count;
    } catch (err: unknown) {
      this.logger.error({
        op: 'ai.cache.gc.error',
        err: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}
