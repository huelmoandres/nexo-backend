/**
 * Normaliza la salida de OpenAI antes de JSON.parse.
 * gpt-4o-mini suele envolver el array en bloques ```json aunque el prompt pida JSON puro.
 */
export function stripMarkdownCodeFence(raw: string): string {
  let content = raw.trim();
  if (!content.startsWith('```')) {
    return content;
  }

  content = content.replace(/^```(?:json)?\s*\n?/i, '');
  content = content.replace(/\n?```\s*$/i, '');
  return content.trim();
}

/**
 * Parsea el content de Chat Completions a un array de términos de búsqueda.
 */
export function parseExpansionTermsJson(raw: string): string[] {
  const content = stripMarkdownCodeFence(raw);
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
    throw new Error(`Unexpected OpenAI response format: ${raw}`);
  }

  return parsed;
}
