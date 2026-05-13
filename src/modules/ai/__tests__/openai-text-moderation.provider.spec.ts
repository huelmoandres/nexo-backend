import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OpenAiTextModerationProvider } from '../providers/openai-text-moderation.provider';

const mocks = vi.hoisted(() => {
  const createFn = vi.fn().mockResolvedValue({
    results: [
      {
        flagged: false,
        category_scores: { harassment: 0.01, 'hate/threatening': 0.001 },
      },
    ],
  });
  const OpenAIMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this['moderations'] = { create: createFn };
  });
  return { OpenAIMock, createFn };
});

vi.mock('openai', () => ({
  default: mocks.OpenAIMock,
}));

const aiCfg = {
  openai: { apiKey: 'test-key' },
  provider: { timeoutMs: 30000 },
};

describe('OpenAiTextModerationProvider', () => {
  let provider: OpenAiTextModerationProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFn.mockResolvedValue({
      results: [
        {
          flagged: false,
          category_scores: { harassment: 0.01 },
        },
      ],
    });
    provider = new OpenAiTextModerationProvider(aiCfg as never);
  });

  it('devuelve flagged=false con scores cuando el texto es seguro', async () => {
    const result = await provider.moderate('Texto de prueba seguro');
    expect(result.flagged).toBe(false);
    expect(result.scores).toMatchObject({ harassment: 0.01 });
    expect(result.modelRef).toBe('openai:text-moderation-latest:v1');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('devuelve flagged=true cuando OpenAI detecta contenido', async () => {
    mocks.createFn.mockResolvedValueOnce({
      results: [{ flagged: true, category_scores: { harassment: 0.97 } }],
    });
    const result = await provider.moderate('contenido problemático');
    expect(result.flagged).toBe(true);
  });

  it('lanza error cuando API devuelve results vacío', async () => {
    mocks.createFn.mockResolvedValueOnce({ results: [] });
    await expect(provider.moderate('texto')).rejects.toThrow(
      'OpenAI Moderation API returned empty results',
    );
  });
});
