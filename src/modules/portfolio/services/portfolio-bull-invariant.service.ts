import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { portfolioConfig } from '@config/portfolio.config';

/**
 * Valida en el arranque el invariante del spec portfolio (zombie reclaim vs BullMQ lock).
 *
 * @see `.harness/specs/portfolio-module.md` §6.2
 */
@Injectable()
export class PortfolioBullInvariantService implements OnModuleInit {
  constructor(
    @Inject(portfolioConfig.KEY)
    private readonly portfolio: ConfigType<typeof portfolioConfig>,
  ) {}

  onModuleInit(): void {
    const lockMs = this.portfolio.bullMqLockDurationMs;
    const stalled = this.portfolio.bullMqMaxStalledCount;
    const zombieMs = this.portfolio.reminderZombieReclaimMs;
    const minExclusive = lockMs * (stalled + 1);

    if (zombieMs <= minExclusive) {
      throw new Error(
        `Invalid BullMQ vs consent reminder config: PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS (${zombieMs}) must be > BULLMQ_LOCK_DURATION_MS * (BULLMQ_MAX_STALLED_COUNT + 1) (= ${minExclusive}).`,
      );
    }
  }
}
