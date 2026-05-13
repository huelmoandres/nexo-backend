import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import OpenAI from 'openai';
import { aiConfig } from '@config/ai.config';
import type {
  ITextModerationProvider,
  TextModerationResult,
} from '../interfaces/text-moderation.interface';

const MODEL_REF = 'openai:text-moderation-latest:v1';

/**
 * Implementación de ITextModerationProvider usando OpenAI Moderation API.
 *
 * Recibe texto ya sanitizado por PiiSanitizerService.
 * Devuelve solo scores estructurados; nunca texto libre del proveedor.
 */
@Injectable()
export class OpenAiTextModerationProvider implements ITextModerationProvider {
  private readonly logger = new Logger(OpenAiTextModerationProvider.name);
  private readonly client: OpenAI;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
  ) {
    this.client = new OpenAI({
      apiKey: this.cfg.openai.apiKey,
      timeout: this.cfg.provider.timeoutMs,
    });
  }

  async moderate(text: string): Promise<TextModerationResult> {
    const start = Date.now();

    const response = await this.client.moderations.create({
      input: text,
    });

    const latencyMs = Date.now() - start;
    const result = response.results[0];

    if (!result) {
      throw new Error('OpenAI Moderation API returned empty results');
    }

    const scores = result.category_scores as unknown as Record<string, number>;
    const flagged = result.flagged;

    this.logger.debug({
      op: 'ai.openaiTextModeration.done',
      flagged,
      latencyMs,
    });

    return { flagged, scores, modelRef: MODEL_REF, latencyMs };
  }
}
