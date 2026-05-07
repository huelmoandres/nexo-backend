import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '@config/app.config';
import {
  problemDetailTypeFromScreamingCode,
  problemDetailTypeUrl,
} from './problem-detail-url.util';

/**
 * Expone la base configurada para URIs `type` de errores RFC 7807.
 */
@Injectable()
export class ProblemDetailTypeService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * @returns URL base sin barra final (p. ej. `https://nexos.com/errors`).
   */
  getBaseUrl(): string {
    return this.config.problemDetailTypeBaseUrl;
  }

  /**
   * @param kebabSlug - Segmento ya en kebab-case (ej. `user-not-found`).
   * @returns URI absoluto para el campo `type` del Problem Detail.
   */
  url(kebabSlug: string): string {
    return problemDetailTypeUrl(this.getBaseUrl(), kebabSlug);
  }

  /**
   * @param code - Código en `SCREAMING_SNAKE_CASE` del payload de error; se convierte a kebab-case.
   * @returns URI absoluto para el campo `type` del Problem Detail.
   */
  fromScreamingCode(code: string): string {
    return problemDetailTypeFromScreamingCode(this.getBaseUrl(), code);
  }
}
