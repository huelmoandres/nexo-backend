import { describe, expect, it } from 'vitest';
import {
  parseExpansionTermsJson,
  stripMarkdownCodeFence,
} from '../parse-expansion-terms.util';

describe('stripMarkdownCodeFence', () => {
  it('deja JSON puro sin cambios', () => {
    const raw = '["electricista", "electricidad"]';
    expect(stripMarkdownCodeFence(raw)).toBe(raw);
  });

  it('quita bloque ```json', () => {
    const raw = '```json\n["electricista", "electricidad"]\n```';
    expect(stripMarkdownCodeFence(raw)).toBe(
      '["electricista", "electricidad"]',
    );
  });

  it('quita bloque ``` sin etiqueta', () => {
    const raw = '```\n["a", "b"]\n```';
    expect(stripMarkdownCodeFence(raw)).toBe('["a", "b"]');
  });
});

describe('parseExpansionTermsJson', () => {
  it('parsea array JSON puro', () => {
    expect(parseExpansionTermsJson('["electricista", "electricidad"]')).toEqual(
      ['electricista', 'electricidad'],
    );
  });

  it('parsea array envuelto en markdown', () => {
    const raw =
      '```json\n["electricista", "electricidad", "instalaciones eléctricas"]\n```';
    expect(parseExpansionTermsJson(raw)).toEqual([
      'electricista',
      'electricidad',
      'instalaciones eléctricas',
    ]);
  });

  it('lanza si el contenido no es un array de strings', () => {
    expect(() => parseExpansionTermsJson('{"terms":[]}')).toThrow(
      /Unexpected OpenAI response format/,
    );
  });

  it('lanza si el JSON es inválido', () => {
    expect(() => parseExpansionTermsJson('not json')).toThrow(SyntaxError);
  });
});
