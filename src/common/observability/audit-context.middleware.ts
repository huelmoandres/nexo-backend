import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { observabilityConfig } from '@config/observability.config';
import { AuditContextService } from './audit-context.service';

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  constructor(
    private readonly auditContext: AuditContextService,
    @Inject(observabilityConfig.KEY)
    private readonly cfg: ConfigType<typeof observabilityConfig>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers[this.cfg.correlationHeader];
    const incoming =
      typeof header === 'string' && header.trim().length > 0
        ? header.trim()
        : undefined;
    const correlationId = incoming ?? randomUUID();
    res.setHeader(this.cfg.correlationHeader, correlationId);

    this.auditContext.run({ correlationId, source: 'HTTP' }, () => next());
  }
}
