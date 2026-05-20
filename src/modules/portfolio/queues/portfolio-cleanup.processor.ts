import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { PrismaService } from '@prisma/prisma.service';
import { PORTFOLIO_CLEANUP_QUEUE } from '../portfolio.constants';

export const PORTFOLIO_CLEANUP_JOB = 'cleanup-item';

export interface PortfolioCleanupJobData {
  professionalId: string;
  itemId: string;
}

/**
 * Worker que borra las fotos huérfanas de R2 tras soft-delete de un PortfolioItem.
 * Lee las fileKeys desde DB (incluyendo soft-deleted items) y llama deleteObjectAsSystem.
 */
@Processor(PORTFOLIO_CLEANUP_QUEUE)
export class PortfolioCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(PortfolioCleanupProcessor.name);

  constructor(
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<PortfolioCleanupJobData>): Promise<void> {
    if (job.name !== PORTFOLIO_CLEANUP_JOB) return;

    const { itemId, professionalId } = job.data;
    this.logger.log({ op: 'portfolio.cleanup.start', itemId, professionalId });

    const photos = await this.prisma.portfolioPhoto.findMany({
      where: { portfolioItemId: itemId },
      select: { fileKey: true },
    });

    let deleted = 0;
    for (const photo of photos) {
      try {
        await this.storage.deleteObjectAsSystem(
          photo.fileKey,
          undefined,
          `portfolio-cleanup:item=${itemId}`,
        );
        deleted++;
      } catch (err: unknown) {
        this.logger.warn({
          op: 'portfolio.cleanup.deleteObjectFailed',
          itemId,
          fileKey: photo.fileKey,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.log({
      op: 'portfolio.cleanup.done',
      itemId,
      totalPhotos: photos.length,
      deleted,
    });
  }
}
