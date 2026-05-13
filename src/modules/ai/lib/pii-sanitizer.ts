import { Injectable } from '@nestjs/common';

/**
 * Elimina PII (información de identificación personal) de strings antes de:
 *   - Enviarlos a proveedores externos (OpenAI, AWS, etc.)
 *   - Persistirlos en logs o en la tabla AiInferenceCache.
 *
 * Patrones scrubbing:
 *   - Emails
 *   - Teléfonos (formato UY y E.164)
 *   - Cédulas de identidad uruguayas (7–8 dígitos con puntos/guion opcionales)
 *   - IBANs
 *   - URLs con tokens o queries
 *   - Tarjetas de crédito (PAN 13–19 dígitos)
 */
@Injectable()
export class PiiSanitizerService {
  private static readonly EMAIL_RE =
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private static readonly PHONE_RE =
    /(\+?598[\s-]?)?(\(0\d{1,4}\)[\s-]?)?\d{3,4}[\s-]?\d{4,6}/g;
  private static readonly CEDULA_RE =
    /\b\d{1,2}[.-]?\d{3}[.-]?\d{3}[.-]?\d?\b/g;
  private static readonly IBAN_RE = /[A-Z]{2}\d{2}[A-Z0-9]{4,30}/g;
  private static readonly URL_TOKEN_RE = /https?:\/\/[^\s"'<>)]+/g;
  private static readonly PAN_RE = /\b(?:\d[\s-]?){13,19}\b/g;

  sanitize(text: string): string {
    return text
      .replace(PiiSanitizerService.EMAIL_RE, '[EMAIL]')
      .replace(PiiSanitizerService.IBAN_RE, '[IBAN]')
      .replace(PiiSanitizerService.URL_TOKEN_RE, '[URL]')
      .replace(PiiSanitizerService.PHONE_RE, '[PHONE]')
      .replace(PiiSanitizerService.CEDULA_RE, '[CEDULA]')
      .replace(PiiSanitizerService.PAN_RE, '[PAN]');
  }

  sanitizeErrorMessage(message: string | undefined): string | undefined {
    if (!message) return undefined;
    const trimmed = message.slice(0, 1000);
    return this.sanitize(trimmed);
  }
}
