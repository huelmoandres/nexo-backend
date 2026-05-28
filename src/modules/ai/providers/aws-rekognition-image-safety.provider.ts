import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';
import { aiConfig } from '@config/ai.config';
import type {
  IImageSafetyClassifier,
  ImageSafetyResult,
} from '../interfaces/image-safety.interface';

const MODEL_REF = 'aws:rekognition:v1';

/** Umbral de confianza para considerar una etiqueta como positiva (0-100). */
const CONFIDENCE_THRESHOLD = 75;

/**
 * Implementación de IImageSafetyClassifier usando AWS Rekognition Content Moderation.
 *
 * Recibe buffer de imagen ya optimizado por ImagePrepService (~1024px JPEG).
 * Devuelve scores estructurados por categoría de moderación.
 */
@Injectable()
export class AwsRekognitionImageSafetyProvider implements IImageSafetyClassifier {
  private readonly logger = new Logger(AwsRekognitionImageSafetyProvider.name);
  private readonly rekognition: RekognitionClient;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
  ) {
    const accessKeyId = this.cfg.aws.accessKeyId ?? '';
    const secretAccessKey = this.cfg.aws.secretAccessKey ?? '';
    const sessionToken = this.cfg.aws.sessionToken ?? '';
    const hasStaticCreds =
      accessKeyId.trim() !== '' && secretAccessKey.trim() !== '';

    this.rekognition = new RekognitionClient({
      region: this.cfg.aws.region,
      ...(hasStaticCreds
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
              ...(sessionToken.trim() !== '' ? { sessionToken } : {}),
            },
          }
        : {}),
    });
  }

  async classify(imageBuffer: Buffer): Promise<ImageSafetyResult> {
    const start = Date.now();

    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBuffer },
      MinConfidence: CONFIDENCE_THRESHOLD,
    });

    const response = await this.rekognition.send(command);
    const latencyMs = Date.now() - start;

    const scores: Record<string, number> = {};
    let flagged = false;

    for (const label of response.ModerationLabels ?? []) {
      if (label.Name && label.Confidence !== undefined) {
        const key = label.Name.toLowerCase().replace(/\s+/g, '_');
        scores[key] = label.Confidence / 100;
        flagged = true;
      }
    }

    this.logger.debug({
      op: 'ai.awsRekognition.done',
      flagged,
      labelCount: Object.keys(scores).length,
      latencyMs,
    });

    return { flagged, scores, modelRef: MODEL_REF, latencyMs };
  }
}
