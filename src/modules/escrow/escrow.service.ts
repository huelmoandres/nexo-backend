import { Inject, Injectable, Logger } from '@nestjs/common';
import { logOp, ProcessAuditService } from '@common/observability';
import { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { addBusinessDays, differenceInMilliseconds } from 'date-fns';
import { JobStatus } from '@prisma/client';
import { problemException } from '@common/errors/problem.factory';
import { escrowConfig } from '@config/escrow.config';
import { payoutConfig } from '@config/payout.config';
import { ExchangeRatesService } from '@modules/exchange-rates/exchange-rates.service';
import { PrismaService } from '@prisma/prisma.service';
import {
  SILENT_ACCEPTANCE_JOB,
  SILENT_ACCEPTANCE_QUEUE,
} from './escrow.constants';
import { EscrowPayoutService } from './escrow-payout.service';
import { EscrowRepository } from './escrow.repository';
import { PayoutAttemptTrigger } from '@prisma/client';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly repository: EscrowRepository,
    private readonly escrowPayout: EscrowPayoutService,
    private readonly prisma: PrismaService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly processAudit: ProcessAuditService,
    @InjectQueue(SILENT_ACCEPTANCE_QUEUE)
    private readonly silentQueue: Queue,
    @Inject(escrowConfig.KEY)
    private readonly cfg: ConfigType<typeof escrowConfig>,
    @Inject(payoutConfig.KEY)
    private readonly payoutCfg: ConfigType<typeof payoutConfig>,
  ) {}

  async createPending(jobId: string): Promise<void> {
    await this.repository.createPending(jobId);
  }

  async fundEscrow(
    jobId: string,
    providerReference: string,
    auditUserId: string,
  ): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { currency: true, escrowTransaction: true },
    });
    if (!job?.escrowTransaction) {
      throw problemException('ESCROW_NOT_FOUND');
    }
    if (job.escrowTransaction.status !== 'PENDING') {
      return;
    }
    const conversion =
      await this.exchangeRatesService.convertJobTotalToUyuCents(
        job.totalAmountCents,
        job.currency.code,
      );
    const commissionCents = Math.round(
      (conversion.heldAmountCents * this.cfg.commissionRateBps) / 10_000,
    );
    const netAmountCents = conversion.heldAmountCents - commissionCents;
    logOp(this.logger, 'log', {
      op: 'escrow.fund',
      phase: 'start',
      jobId,
      providerReference,
    });
    await this.repository.fundEscrow(
      jobId,
      {
        amountCents: conversion.heldAmountCents,
        commissionCents,
        netAmountCents,
        jobCurrencyId: job.currencyId,
        jobAmountCents: job.totalAmountCents,
        exchangeRateId: conversion.exchangeRateId,
        providerReference,
      },
      auditUserId,
    );
    logOp(this.logger, 'log', { op: 'escrow.fund', phase: 'done', jobId });
  }

  async scheduleSilentAcceptance(
    jobId: string,
    completedAt: Date,
  ): Promise<void> {
    const deadline = addBusinessDays(
      completedAt,
      this.cfg.silentAcceptanceBusinessDays,
    );
    const delayMs = Math.max(0, differenceInMilliseconds(deadline, new Date()));
    const bullJob = await this.silentQueue.add(
      SILENT_ACCEPTANCE_JOB,
      { jobId },
      {
        jobId: `silent-${jobId}`,
        delay: delayMs,
        removeOnComplete: true,
      },
    );
    await this.repository.setBullJobId(jobId, bullJob.id ?? null);
  }

  async cancelSilentAcceptance(jobId: string): Promise<void> {
    const escrow = await this.repository.findByJobId(jobId);
    if (escrow?.bullJobId) {
      const job = await this.silentQueue.getJob(escrow.bullJobId);
      if (job) {
        await job.remove();
      }
    }
    await this.repository.setBullJobId(jobId, null);
  }

  async releaseForJob(jobId: string, auditUserId: string): Promise<void> {
    await this.cancelSilentAcceptance(jobId);
    const manual = this.payoutCfg.mode === 'manual';
    logOp(this.logger, 'log', { op: 'escrow.release', phase: 'start', jobId });
    try {
      await this.repository.release(jobId, auditUserId, undefined, {
        setPayoutPending: manual,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.message === 'INVALID_ESCROW_TRANSITION') {
        await this.processAudit.record({
          domain: 'ESCROW',
          operation: 'escrow.release',
          outcome: 'FAILURE',
          source: 'HTTP',
          severity: 'warn',
          entityType: 'Job',
          entityId: jobId,
          problemCode: 'INVALID_ESCROW_TRANSITION',
          errorMessage: message,
        });
        throw problemException('INVALID_ESCROW_TRANSITION');
      }
      await this.processAudit.record({
        domain: 'ESCROW',
        operation: 'escrow.release',
        outcome: 'FAILURE',
        source: 'HTTP',
        severity: 'error',
        entityType: 'Job',
        entityId: jobId,
        errorMessage: message,
      });
      throw err;
    }
    logOp(this.logger, 'log', { op: 'escrow.release', phase: 'done', jobId });
    if (manual) {
      return;
    }
    await this.escrowPayout.executePayoutForJob(
      jobId,
      auditUserId,
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
  }

  async processSilentAcceptance(jobId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job || job.status !== JobStatus.COMPLETED) {
        return;
      }
      const escrow = await tx.escrowTransaction.findUnique({
        where: { jobId },
      });
      if (!escrow || escrow.status !== 'HELD') {
        return;
      }
      await tx.job.update({
        where: { id: jobId },
        data: { status: JobStatus.CLOSED },
      });
      const manual = this.payoutCfg.mode === 'manual';
      await this.repository.release(jobId, job.clientId, tx, {
        setPayoutPending: manual,
      });
      await this.repository.setBullJobId(jobId, null, tx);
      if (!manual) {
        // gateway mode: payout fuera de la TX (comportamiento previo vía approve-completion)
      }
    });
    if (this.payoutCfg.mode !== 'manual') {
      const job = await this.prisma.job.findUnique({ where: { id: jobId } });
      if (job?.status === JobStatus.CLOSED) {
        await this.escrowPayout.executePayoutForJob(
          jobId,
          job.clientId,
          PayoutAttemptTrigger.RELEASE_FLOW,
        );
      }
    }
  }
}
