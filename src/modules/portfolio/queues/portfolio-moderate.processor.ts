import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { AiModerationStatus, ModerationTransitionType } from '@prisma/client';
import { aiConfig } from '@config/ai.config';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import {
  CONTENT_MODERATION_PROVIDER_TOKEN,
  type IContentModerationProvider,
} from '../services/content-moderation.provider';
import { PortfolioRepository } from '../portfolio.repository';
import { PORTFOLIO_MODERATE_QUEUE } from '../portfolio.constants';

export const PORTFOLIO_MODERATE_JOB = 'moderate-item';

export interface PortfolioModerateJobData {
  itemId: string;
  /** SHA-256 del texto normalizado para logging/observabilidad. */
  textHash?: string;
  /** fileKeys de las fotos asociadas al item. */
  photoFileKeys: string[];
  /** Título + descripción del item (PII cruda; el provider sanitiza). */
  text: string;
  /** Si true, fuerza re-análisis ignorando caché. */
  forceReanalyze?: boolean;
}

/**
 * Processor del worker `portfolio-moderate`.
 *
 * Responsabilidades:
 *   1. Descargar bytes originales de imágenes desde R2 (para SHA-256 canónico).
 *   2. Llamar a IContentModerationProvider con texto + buffers.
 *   3. Aplicar veredicto en base de datos vía PortfolioRepository.applyAiModerationVerdict.
 *   4. Fail-closed: cualquier error no controlado → HIDDEN_PENDING_REVIEW.
 */
@Processor(PORTFOLIO_MODERATE_QUEUE)
export class PortfolioModerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PortfolioModerateProcessor.name);

  constructor(
    private readonly repository: PortfolioRepository,
    @Inject(CONTENT_MODERATION_PROVIDER_TOKEN)
    private readonly moderation: IContentModerationProvider,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    @Inject(aiConfig.KEY)
    private readonly aiCfg: ConfigType<typeof aiConfig>,
  ) {
    super();
  }

  async process(job: Job<PortfolioModerateJobData>): Promise<void> {
    if (job.name !== PORTFOLIO_MODERATE_JOB) {
      this.logger.warn(
        { jobName: job.name, jobId: job.id },
        'Job desconocido en cola portfolio-moderate',
      );
      return;
    }

    const { itemId, photoFileKeys, text } = job.data;

    this.logger.log({
      op: 'portfolio.moderate.start',
      itemId,
      photoCount: photoFileKeys.length,
    });

    try {
      const imageBuffersByKey = await this.downloadImageBuffers(
        itemId,
        photoFileKeys,
      );

      const result = await this.moderation.moderate({
        text,
        photoFileKeys,
        imageBuffersByKey,
      });

      await this.repository.applyAiModerationVerdict({
        itemId,
        aiModerationStatus: result.status,
        modelRef: result.modelRef,
        transitionType: ModerationTransitionType.INITIAL,
        reason: result.reason,
        policyVersion: this.aiCfg.policyVersion,
      });

      this.logger.log({
        op: 'portfolio.moderate.done',
        itemId,
        status: result.status,
        modelRef: result.modelRef,
        policyVersion: this.aiCfg.policyVersion,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error({
        op: 'portfolio.moderate.error',
        itemId,
        err: errMsg,
      });

      await this.repository
        .applyAiModerationVerdict({
          itemId,
          aiModerationStatus: AiModerationStatus.FLAGGED,
          modelRef: 'ai:error:fail-closed',
          transitionType: ModerationTransitionType.INITIAL,
          reason: 'provider_error',
          policyVersion: this.aiCfg.policyVersion,
          errorCode: 'AI_PROVIDER_ERROR',
          errorMessage: errMsg.slice(0, 1000),
        })
        .catch((repoErr: unknown) => {
          this.logger.error({
            op: 'portfolio.moderate.failClosedWriteError',
            itemId,
            err: repoErr instanceof Error ? repoErr.message : String(repoErr),
          });
        });

      throw err;
    }
  }

  /**
   * Descarga los bytes originales de cada foto desde R2.
   * Omite silenciosamente las que fallen (loguea warn): el provider
   * omitirá la moderación de esa foto y no la marcará como flaggeada.
   */
  private async downloadImageBuffers(
    itemId: string,
    fileKeys: string[],
  ): Promise<Record<string, Buffer>> {
    const result: Record<string, Buffer> = {};

    await Promise.all(
      fileKeys.map(async (key) => {
        try {
          result[key] = await this.storage.downloadObject(key);
        } catch (err: unknown) {
          this.logger.warn({
            op: 'portfolio.moderate.downloadFailed',
            itemId,
            fileKey: key,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    return result;
  }
}
