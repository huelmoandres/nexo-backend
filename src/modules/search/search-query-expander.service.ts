import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigType } from '@nestjs/config';
// opossum es CJS (module.exports); default import falla en runtime Nest (commonjs).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import CircuitBreaker = require('opossum');
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type Redis from 'ioredis';
import { searchConfig } from '@config/search.config';
import { aiConfig } from '@config/ai.config';
import { buildSearchExpansionSystemPrompt } from '@config/search-expansion-prompt';
import { CategoriesRepository } from '@modules/categories/categories.repository';
import { CATEGORIES_CHANGED_EVENT } from '@modules/categories/categories.events';
import { SEARCH_REDIS_CLIENT } from './search.constants';
import { parseExpansionTermsJson } from './parse-expansion-terms.util';

/**
 * Expande queries de búsqueda con sinónimos/variantes usando OpenAI.
 *
 * El system prompt se construye dinámicamente con las categorías de la BD
 * al arrancar (`onModuleInit`). Cuando el admin agrega/edita/borra categorías,
 * `reloadCategories()` reconstruye el prompt sin reiniciar el servidor.
 *
 * Estrategia de performance:
 * - Cache Redis con TTL largo (7 días default).
 * - Circuit breaker: degradación graceful si OpenAI falla.
 * - Timeout agresivo (2s default): la búsqueda nunca se bloquea esperando IA.
 */
@Injectable()
export class SearchQueryExpanderService implements OnModuleInit {
  private readonly logger = new Logger(SearchQueryExpanderService.name);
  private client!: OpenAI;
  private breaker!: CircuitBreaker<[string], string[]>;
  private systemPrompt = '';

  constructor(
    @Inject(searchConfig.KEY)
    private readonly config: ConfigType<typeof searchConfig>,
    @Inject(aiConfig.KEY)
    private readonly ai: ConfigType<typeof aiConfig>,
    @Inject(SEARCH_REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly categoriesRepo: CategoriesRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = new OpenAI({
      apiKey: this.ai.openai.apiKey,
      timeout: this.config.expansion.timeoutMs,
    });

    const { circuitBreaker: cb } = this.config.expansion;
    this.breaker = new CircuitBreaker((q: string) => this.callOpenAI(q), {
      timeout: this.config.expansion.timeoutMs + 500,
      errorThresholdPercentage: cb.errorThresholdPercentage,
      resetTimeout: cb.resetTimeoutMs,
    });

    this.breaker.on('open', () =>
      this.logger.warn({ op: 'search.expander.circuitOpen' }),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.log({ op: 'search.expander.circuitHalfOpen' }),
    );

    await this.reloadCategories();
  }

  /**
   * Recarga categorías de la BD y reconstruye el system prompt.
   * Se ejecuta automáticamente al recibir el evento `categories.changed`.
   */
  @OnEvent(CATEGORIES_CHANGED_EVENT)
  async reloadCategories(): Promise<void> {
    try {
      const categories = await this.categoriesRepo.findAll();
      this.systemPrompt = buildSearchExpansionSystemPrompt(categories);
      this.logger.log({
        op: 'search.expander.promptReloaded',
        categoryCount: categories.length,
      });
    } catch (err: unknown) {
      this.logger.error({
        op: 'search.expander.promptReloadError',
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Expande un término de búsqueda a múltiples sinónimos/variantes.
   * Nunca lanza: si falla, devuelve `[q]`.
   */
  async expand(q: string): Promise<string[]> {
    if (!this.config.expansion.enabled) return [q];

    const normalized = q.toLowerCase().trim();
    if (!normalized) return [q];

    const hash = createHash('sha256').update(normalized).digest('hex');
    const cacheKey = `${this.config.expansion.cachePrefix}${hash}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ op: 'search.expander.cacheHit', q: normalized });
        return JSON.parse(cached) as string[];
      }
    } catch {
      this.logger.warn({ op: 'search.expander.cacheReadError', q: normalized });
    }

    try {
      const terms = await this.breaker.fire(normalized);

      try {
        await this.redis.setex(
          cacheKey,
          this.config.expansion.ttlSeconds,
          JSON.stringify(terms),
        );
      } catch {
        this.logger.warn({
          op: 'search.expander.cacheWriteError',
          q: normalized,
        });
      }

      this.logger.debug({
        op: 'search.expander.expanded',
        q: normalized,
        terms,
      });
      return terms;
    } catch (err: unknown) {
      this.logger.warn({
        op: 'search.expander.fallback',
        q: normalized,
        err: err instanceof Error ? err.message : String(err),
      });
      return [q];
    }
  }

  private async callOpenAI(q: string): Promise<string[]> {
    const { expansion } = this.config;

    const response = await this.client.chat.completions.create({
      model: expansion.model,
      temperature: 0,
      max_tokens: expansion.maxTokens,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: q },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() ?? '[]';
    const parsed = parseExpansionTermsJson(content);

    if (!parsed.includes(q)) parsed.unshift(q);

    return parsed.slice(0, expansion.maxTerms);
  }
}
