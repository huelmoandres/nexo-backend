import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import { createHash } from 'node:crypto';
import { AiModerationStatus } from '@prisma/client';
import { aiConfig } from '@config/ai.config';
import type {
  IContentModerationProvider,
  ModerationInput,
  ModerationResult,
} from '@modules/portfolio/services/content-moderation.provider';
import {
  IMAGE_SAFETY_CLASSIFIER_TOKEN,
  TEXT_MODERATION_PROVIDER_TOKEN,
} from '../ai.constants';
import type { IImageSafetyClassifier } from '../interfaces/image-safety.interface';
import type { ITextModerationProvider } from '../interfaces/text-moderation.interface';
import { PiiSanitizerService } from '../lib/pii-sanitizer';
import { InferenceCacheService } from '../lib/inference-cache.service';
import { InferenceLockService } from '../lib/inference-lock.service';
import { ImagePrepService } from '../lib/image-prep.service';

const TASK_TEXT = 'TEXT_MODERATION_V1';
const TASK_IMAGE = 'IMAGE_SAFETY_V1';
const SOURCE_MODULE = 'portfolio';

interface TextResult {
  flagged: boolean;
  scores: Record<string, number>;
  modelRef: string;
}
interface ImageResult {
  flagged: boolean;
  scores: Record<string, number>;
  modelRef: string;
  fileKey: string;
}

/**
 * Servicio principal de moderación de contenido.
 * Implementa IContentModerationProvider con:
 *   - Circuit breaker (opossum) por tipo de tarea
 *   - Caché de inferencia L1/L2 (InferenceCacheService)
 *   - Lock distribuido anti-stampede (InferenceLockService)
 *   - Optimización de imagen (ImagePrepService + sharp)
 *   - Sanitización de PII (PiiSanitizerService)
 *   - Fail-closed: si falla IA → HIDDEN_PENDING_REVIEW (nunca fail-open)
 */
@Injectable()
export class AiContentModerationService
  implements IContentModerationProvider, OnModuleInit
{
  private readonly logger = new Logger(AiContentModerationService.name);

  private textBreaker!: CircuitBreaker<any[], TextResult>;

  private imageBreaker!: CircuitBreaker<any[], ImageResult>;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
    @Inject(TEXT_MODERATION_PROVIDER_TOKEN)
    private readonly textProvider: ITextModerationProvider,
    @Inject(IMAGE_SAFETY_CLASSIFIER_TOKEN)
    private readonly imageProvider: IImageSafetyClassifier,
    private readonly pii: PiiSanitizerService,
    private readonly cache: InferenceCacheService,
    private readonly lock: InferenceLockService,
    private readonly imagePrep: ImagePrepService,
  ) {}

  onModuleInit(): void {
    const breakerOpts: CircuitBreaker.Options = {
      timeout: this.cfg.provider.timeoutMs,
      errorThresholdPercentage:
        this.cfg.circuitBreaker.errorThresholdPercentage,
      resetTimeout: this.cfg.circuitBreaker.resetTimeoutMs,
    };

    this.textBreaker = new CircuitBreaker(
      (text: string) => this.callTextProvider(text),
      breakerOpts,
    );
    this.imageBreaker = new CircuitBreaker(
      (buf: Buffer) => this.callImageProvider(buf),
      breakerOpts,
    );

    for (const cb of [this.textBreaker, this.imageBreaker] as CircuitBreaker<
      unknown[]
    >[]) {
      cb.on('open', () => this.logger.warn({ op: 'ai.circuitBreaker.open' }));
      cb.on('halfOpen', () =>
        this.logger.log({ op: 'ai.circuitBreaker.halfOpen' }),
      );
      cb.on('close', () => this.logger.log({ op: 'ai.circuitBreaker.closed' }));
    }
  }

  async moderate(input: ModerationInput): Promise<ModerationResult> {
    try {
      const [textResult, imageResults] = await Promise.all([
        this.moderateText(input.text),
        Promise.all(
          input.photoFileKeys.map((fk) =>
            this.moderateImage(fk, input.imageBuffersByKey),
          ),
        ),
      ]);

      const anyFlagged =
        textResult.flagged || imageResults.some((r) => r.flagged);

      return {
        status: anyFlagged ? AiModerationStatus.FLAGGED : AiModerationStatus.OK,
        modelRef: textResult.modelRef,
        reason: anyFlagged
          ? this.summarizeReason(textResult, imageResults)
          : undefined,
      };
    } catch (err: unknown) {
      this.logger.error({
        op: 'ai.contentModeration.failClosed',
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        status: AiModerationStatus.FLAGGED,
        modelRef: 'ai:error:fail-closed',
        reason: 'provider_error',
      };
    }
  }

  // ---------------------------------------------------------------------------

  private async moderateText(rawText: string): Promise<TextResult> {
    const sanitized = this.pii.sanitize(rawText);
    const contentHash = sha256(sanitized);
    const policyVersion = this.cfg.policyVersion;
    const cacheKey = { taskType: TASK_TEXT, contentHash, policyVersion };

    const cached = await this.cache.get<TextResult>(cacheKey);
    if (cached) return cached.result;

    const lock = await this.lock.acquire(TASK_TEXT, contentHash);

    try {
      const recheck = await this.cache.get<TextResult>(cacheKey);
      if (recheck) return recheck.result;

      const raw = await this.textBreaker.fire(sanitized);
      const result: TextResult = {
        flagged: raw.flagged,
        scores: raw.scores,
        modelRef: raw.modelRef,
      };

      await this.cache.set(
        cacheKey,
        { modelRef: raw.modelRef, result },
        SOURCE_MODULE,
      );
      return result;
    } finally {
      if (lock) await this.lock.release(lock);
    }
  }

  private async moderateImage(
    fileKey: string,
    buffersByKey?: Record<string, Buffer>,
  ): Promise<ImageResult> {
    const originalBuffer = buffersByKey?.[fileKey];
    if (!originalBuffer) {
      this.logger.warn({ op: 'ai.contentModeration.imageMissing', fileKey });
      return {
        flagged: false,
        scores: {},
        modelRef: 'ai:skipped:no-buffer',
        fileKey,
      };
    }

    const contentHash = sha256Buffer(originalBuffer);
    const policyVersion = this.cfg.policyVersion;
    const cacheKey = { taskType: TASK_IMAGE, contentHash, policyVersion };

    const cached = await this.cache.get<ImageResult>(cacheKey);
    if (cached) return { ...cached.result, fileKey };

    const lock = await this.lock.acquire(TASK_IMAGE, contentHash);

    try {
      const recheck = await this.cache.get<ImageResult>(cacheKey);
      if (recheck) return { ...recheck.result, fileKey };

      const {
        buffer: preparedBuffer,
        outputBytes,
        durationMs,
      } = await this.imagePrep.prepareForInference(originalBuffer);

      this.logger.debug({
        op: 'ai.imagePrep',
        fileKey,
        outputBytes,
        durationMs,
      });

      const raw = await this.imageBreaker.fire(preparedBuffer);
      const result: ImageResult = {
        flagged: raw.flagged,
        scores: raw.scores,
        modelRef: raw.modelRef,
        fileKey,
      };

      await this.cache.set(
        cacheKey,
        { modelRef: raw.modelRef, result },
        SOURCE_MODULE,
      );
      return result;
    } finally {
      if (lock) await this.lock.release(lock);
    }
  }

  private async callTextProvider(text: string): Promise<TextResult> {
    const r = await this.textProvider.moderate(text);
    return { flagged: r.flagged, scores: r.scores, modelRef: r.modelRef };
  }

  private async callImageProvider(buf: Buffer): Promise<ImageResult> {
    const r = await this.imageProvider.classify(buf);
    return {
      flagged: r.flagged,
      scores: r.scores,
      modelRef: r.modelRef,
      fileKey: '',
    };
  }

  private summarizeReason(text: TextResult, images: ImageResult[]): string {
    const parts: string[] = [];
    if (text.flagged) {
      const topCat = topKey(text.scores);
      if (topCat) parts.push(topCat);
    }
    for (const img of images) {
      if (img.flagged) {
        const topCat = topKey(img.scores);
        if (topCat) parts.push(topCat);
      }
    }
    return parts.join(',') || 'flagged';
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function topKey(scores: Record<string, number>): string | undefined {
  return Object.entries(scores).sort(([, a], [, b]) => b - a)[0]?.[0];
}
