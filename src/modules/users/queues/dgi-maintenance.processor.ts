import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  AuditContextService,
  ProcessAuditService,
  runWorkerWithAudit,
} from '@common/observability';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  DgiVerificationStatus,
  VerificationDocumentStatus,
} from '@prisma/client';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import {
  USER_ROOT_PREFIX,
  VERIFICATION_DOC_KEY_PATTERN,
} from '@modules/storage/storage-paths';
import { UsersRepository } from '../users.repository';
import {
  DGI_MAINTENANCE_QUEUE,
  DGI_ORPHAN_CLEANUP_JOB,
  DGI_STALE_REJECTION_REASON,
  DGI_STALE_WATCHDOG_JOB,
} from '../users-dgi.constants';

@Processor(DGI_MAINTENANCE_QUEUE)
export class DgiMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(DgiMaintenanceProcessor.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    @Inject(usersConfig.KEY)
    private readonly usersCfg: ConfigType<typeof usersConfig>,
    @Inject(dgiConfig.KEY)
    private readonly dgiCfg: ConfigType<typeof dgiConfig>,
    private readonly auditContext: AuditContextService,
    private readonly processAudit: ProcessAuditService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const op =
      job.name === DGI_STALE_WATCHDOG_JOB
        ? 'dgi.staleWatchdog'
        : job.name === DGI_ORPHAN_CLEANUP_JOB
          ? 'dgi.orphanCleanup'
          : 'dgi.maintenance.unknown';
    await runWorkerWithAudit({
      logger: this.logger,
      auditContext: this.auditContext,
      processAudit: this.processAudit,
      job,
      op,
      domain: 'DGI',
      fn: async () => {
        if (job.name === DGI_STALE_WATCHDOG_JOB) {
          await this.runStaleWatchdog();
          return;
        }
        if (job.name === DGI_ORPHAN_CLEANUP_JOB) {
          await this.runOrphanCleanup();
          return;
        }
        this.logger.warn({
          op: 'dgi.maintenance.unknownJob',
          jobName: job.name,
        });
      },
    });
  }

  private async runStaleWatchdog(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.dgiCfg.processingTimeoutMinutes * 60 * 1000,
    );
    const stale =
      await this.usersRepository.findStaleDgiProcessingSubjects(cutoff);
    this.logger.log({
      op: 'dgi.staleWatchdog.start',
      count: stale.length,
      cutoff: cutoff.toISOString(),
    });

    for (const subject of stale) {
      await this.usersRepository.applyDgiVerificationResult({
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        trustProfileId: subject.trustProfileId,
        status: DgiVerificationStatus.REJECTED,
        documentStatus: VerificationDocumentStatus.REJECTED,
        rejectionReason: DGI_STALE_REJECTION_REASON,
      });
      await this.notifications.notifyDgiVerificationRejected({
        userId: subject.userId,
        trustProfileId: subject.trustProfileId,
        reason: DGI_STALE_REJECTION_REASON,
      });
    }
  }

  private async runOrphanCleanup(): Promise<void> {
    const referenced =
      await this.usersRepository.listReferencedVerificationDocKeys();
    const minAgeMs = this.dgiCfg.orphanMinAgeHours * 60 * 60 * 1000;
    const cutoff = Date.now() - minAgeMs;

    const objects = await this.storage.listObjectsByPrefix({
      prefix: `${USER_ROOT_PREFIX}/`,
      bucket: this.usersCfg.kycBucket,
    });

    let deleted = 0;
    for (const obj of objects) {
      if (!VERIFICATION_DOC_KEY_PATTERN.test(obj.key)) {
        continue;
      }
      if (referenced.has(obj.key)) {
        continue;
      }
      if (obj.lastModified.getTime() > cutoff) {
        continue;
      }
      try {
        await this.storage.deleteObjectAsSystem(
          obj.key,
          this.usersCfg.kycBucket,
          'dgi-orphan-cleanup',
        );
        deleted++;
      } catch (err: unknown) {
        this.logger.warn({
          op: 'dgi.orphanCleanup.deleteFailed',
          key: obj.key,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.log({
      op: 'dgi.orphanCleanup.done',
      scanned: objects.length,
      deleted,
      referencedCount: referenced.size,
    });
  }
}
