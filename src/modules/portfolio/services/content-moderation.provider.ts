import { Injectable } from '@nestjs/common';
import { AiModerationStatus } from '@prisma/client';

/** Input al provider de moderación de contenido. */
export interface ModerationInput {
  /** Texto a evaluar (title + description). PII ya sanitizada por el caller. */
  text: string;
  /** Lista de `fileKey`s de fotos a evaluar (provider decide cómo accederlas). */
  photoFileKeys: string[];
}

/** Resultado de la moderación, mapeable directo a `PortfolioItem`. */
export interface ModerationResult {
  status: AiModerationStatus;
  reason?: string;
  /**
   * Referencia estructurada al modelo/proveedor que emitió el veredicto.
   * Formato `<provider>:<model>:<version>` para auditoría cross-proveedor.
   */
  modelRef: string;
}

/**
 * Contrato del provider de moderación de contenido (IA).
 *
 * Implementaciones reales: OpenAI Moderation API, AWS Rekognition.
 * Fallback: si el provider falla o timeout, el service del publish
 * deja el item en `HIDDEN_PENDING_REVIEW` para revisión humana
 * (regla fail-safe en spec §F).
 */
export interface IContentModerationProvider {
  moderate(input: ModerationInput): Promise<ModerationResult>;
}

/** Token DI para el contrato. */
export const CONTENT_MODERATION_PROVIDER_TOKEN = Symbol(
  'CONTENT_MODERATION_PROVIDER_TOKEN',
);

/**
 * Stub que aprueba todo. Aceptable en desarrollo y mientras se cablea
 * el provider real. `PORTFOLIO_AI_ENABLED=false` mantiene este stub
 * activo incluso en otros entornos.
 */
@Injectable()
export class AlwaysApprovedModerationProvider implements IContentModerationProvider {
  async moderate(input: ModerationInput): Promise<ModerationResult> {
    void input;
    return Promise.resolve({
      status: AiModerationStatus.OK,
      modelRef: 'stub:none:v0',
    });
  }
}
