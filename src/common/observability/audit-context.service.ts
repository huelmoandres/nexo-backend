import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ProcessAuditSource } from '@prisma/client';
import type { AuditContextStore } from './process-audit.types';

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditContextStore>();

  run<T>(store: AuditContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  runAsync<T>(store: AuditContextStore, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(store, fn);
  }

  get(): AuditContextStore | undefined {
    return this.storage.getStore();
  }

  getCorrelationId(): string {
    return this.get()?.correlationId ?? randomUUID();
  }

  getUserId(): string | undefined {
    return this.get()?.userId;
  }

  getSource(): ProcessAuditSource | undefined {
    return this.get()?.source;
  }

  setUserId(userId: string): void {
    const store = this.get();
    if (store) {
      store.userId = userId;
    }
  }

  ensureWorkerContext(jobId?: string): AuditContextStore {
    const existing = this.get();
    if (existing) {
      return existing;
    }
    const store: AuditContextStore = {
      correlationId: jobId ? `job:${jobId}` : randomUUID(),
      source: 'WORKER',
    };
    this.storage.enterWith(store);
    return store;
  }
}
