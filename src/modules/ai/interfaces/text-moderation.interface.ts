/**
 * Resultado de la moderación de texto.
 * Solo categorías y scores; sin texto libre del proveedor.
 */
export interface TextModerationResult {
  /** true si el texto supera algún umbral de moderación. */
  flagged: boolean;
  /** Categorías detectadas con sus scores. Ej: { hate: 0.01, harassment: 0.73 } */
  scores: Record<string, number>;
  /** Referencia al modelo. Formato: vendor:model:version */
  modelRef: string;
  /** Latencia de la llamada al proveedor (ms). */
  latencyMs: number;
}

/**
 * Contrato del moderador de texto.
 *
 * Implementaciones: OpenAI Moderation API, Azure Content Safety, Gemini Flash.
 * El texto recibido ya debe haber sido sanitizado por PiiSanitizerService.
 */
export interface ITextModerationProvider {
  moderate(text: string): Promise<TextModerationResult>;
}
