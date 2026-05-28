import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  JobChangeOrderStatus,
  JobStatus,
  PayoutAttemptTrigger,
  Role,
} from '@prisma/client';
import { BusinessAuditService } from '@common/observability';
import { addBusinessDays } from 'date-fns';
import { problemException } from '@common/errors/problem.factory';
import { ExchangeRatesService } from '@modules/exchange-rates/exchange-rates.service';
import { MoneyConversionService } from '@modules/exchange-rates/money-conversion.service';
import { EscrowService } from '@modules/escrow/escrow.service';
import { EscrowRepository } from '@modules/escrow/escrow.repository';
import { EscrowPayoutService } from '@modules/escrow/escrow-payout.service';
import { PayoutAccountsService } from '@modules/payout-accounts/payout-accounts.service';
import { PayoutAccountsRepository } from '@modules/payout-accounts/payout-accounts.repository';
import { escrowConfig } from '@config/escrow.config';
import { payoutConfig } from '@config/payout.config';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import type { CreateJobDto } from './dto/create-job.dto';
import type { CreateChangeOrderDto } from './dto/create-change-order.dto';
import type { PatchChangeOrderDto } from './dto/patch-change-order.dto';
import type { PatchJobStatusDto } from './dto/patch-job-status.dto';
import { JobsRepository, type JobDetail } from './jobs.repository';

@Injectable()
export class JobsService {
  constructor(
    private readonly repository: JobsRepository,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly moneyConversion: MoneyConversionService,
    private readonly escrowService: EscrowService,
    private readonly escrowRepository: EscrowRepository,
    private readonly escrowPayout: EscrowPayoutService,
    private readonly payoutAccounts: PayoutAccountsService,
    private readonly _payoutRepository: PayoutAccountsRepository,
    @Inject(escrowConfig.KEY)
    private readonly escrowCfg: ConfigType<typeof escrowConfig>,
    @Inject(payoutConfig.KEY)
    private readonly payoutCfg: ConfigType<typeof payoutConfig>,
    private readonly businessAudit: BusinessAuditService,
  ) {}

  private async auditJobStatusChange(
    userId: string,
    jobId: string,
    previous: JobStatus,
    next: JobStatus,
    action: AuditAction = AuditAction.JOB_STATUS_CHANGED,
  ): Promise<void> {
    await this.businessAudit.write({
      userId,
      action,
      entityType: 'Job',
      entityId: jobId,
      previousState: JSON.stringify({ status: previous }),
      newState: JSON.stringify({ status: next }),
    });
  }

  async create(supabaseUid: string, dto: CreateJobDto): Promise<JobDetail> {
    const user = await this.requireUser(supabaseUid, Role.CLIENT);
    const currencies = await this.exchangeRatesService.listCurrencies();
    const currency = currencies.find((c) => c.code === dto.currencyCode);
    if (!currency) {
      throw problemException('JOB_CURRENCY_INVALID');
    }
    const totalAmountCents = dto.priceLines.reduce(
      (sum, line) => sum + line.amountCents,
      0,
    );
    if (totalAmountCents <= 0) {
      throw problemException('JOB_PRICE_LINES_REQUIRED');
    }
    return this.repository.createJob({
      clientId: user.id,
      categoryId: dto.categoryId,
      currencyId: currency.id,
      pricingMode: dto.pricingMode,
      title: dto.title,
      description: dto.description,
      totalAmountCents,
      addressLine: dto.addressLine,
      countryId: dto.countryId,
      stateId: dto.stateId,
      cityId: dto.cityId,
      neighborhoodId: dto.neighborhoodId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      priceLines: dto.priceLines.map((line, index) => ({
        type: line.type,
        label: line.label,
        amountCents: line.amountCents,
        sortOrder: line.sortOrder ?? index,
      })),
    });
  }

  async listMine(supabaseUid: string, page = 1, limit = 20) {
    const user = await this.requireUser(supabaseUid, Role.CLIENT);
    const skip = (page - 1) * limit;
    const items = await this.repository.listByClient(user.id, skip, limit);
    return Promise.all(items.map((j) => this.enrichJob(j)));
  }

  async listAvailable(supabaseUid: string, page = 1, limit = 20) {
    await this.requireUser(supabaseUid, Role.INDEPENDENT_PRO);
    const skip = (page - 1) * limit;
    const items = await this.repository.listPendingAvailable(skip, limit);
    return Promise.all(items.map((j) => this.enrichJob(j)));
  }

  /** Trabajos asignados al perfil profesional del usuario (pro o admin de empresa). */
  async listProfessionalMine(supabaseUid: string, page = 1, limit = 20) {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (
      !user ||
      (user.role !== Role.INDEPENDENT_PRO && user.role !== Role.COMPANY_ADMIN)
    ) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const profileId = user.professionalProfile?.id;
    if (!profileId) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const skip = (page - 1) * limit;
    const items = await this.repository.listByProfessional(
      profileId,
      skip,
      limit,
    );
    return Promise.all(items.map((j) => this.enrichJob(j)));
  }

  async getById(supabaseUid: string, jobId: string) {
    const job = await this.requireJobAccess(supabaseUid, jobId);
    return this.enrichJob(job);
  }

  async accept(supabaseUid: string, jobId: string, payoutAccountId?: string) {
    const user = await this.requireUser(supabaseUid, Role.INDEPENDENT_PRO);
    const profileId = user.professionalProfile?.id;
    if (!profileId) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const job = await this.repository.findById(jobId);
    if (!job) {
      throw problemException('JOB_NOT_FOUND');
    }
    if (job.status !== JobStatus.PENDING) {
      throw problemException('JOB_ALREADY_ASSIGNED');
    }
    const resolvedPayoutId =
      await this.payoutAccounts.assertProfessionalCanAcceptJob(
        profileId,
        payoutAccountId,
      );
    const updated = await this.repository.acceptJobAtomically({
      jobId,
      professionalId: profileId,
      payoutAccountId: resolvedPayoutId,
      auditUserId: user.id,
    });
    if (!updated) {
      throw problemException('JOB_ALREADY_ASSIGNED');
    }
    return this.enrichJob(updated);
  }

  async patchStatus(
    supabaseUid: string,
    jobId: string,
    dto: PatchJobStatusDto,
  ) {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (!user) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const job = await this.requireJobAccess(supabaseUid, jobId);
    this.assertTransition(job, dto.status, user.role);
    const previous = job.status;
    const updated = await this.repository.updateStatus(jobId, dto.status);
    await this.auditJobStatusChange(user.id, jobId, previous, updated.status);
    return this.enrichJob(updated);
  }

  async complete(supabaseUid: string, jobId: string) {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (!user) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const job = await this.requireJobAccess(supabaseUid, jobId);
    if (job.status !== JobStatus.IN_PROGRESS) {
      throw problemException('JOB_INVALID_STATUS_TRANSITION');
    }
    const completedAt = new Date();
    const approvalDeadline = addBusinessDays(
      completedAt,
      this.escrowCfg.silentAcceptanceBusinessDays,
    );
    const updated = await this.repository.updateStatus(
      jobId,
      JobStatus.COMPLETED,
      { completedAt, approvalDeadline },
    );
    await this.auditJobStatusChange(
      user.id,
      jobId,
      job.status,
      JobStatus.COMPLETED,
    );
    await this.escrowService.scheduleSilentAcceptance(jobId, completedAt);
    return this.enrichJob(updated);
  }

  async retryPayout(
    supabaseUid: string,
    jobId: string,
    payoutAccountId?: string,
  ): Promise<void> {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (!user || user.role !== Role.SUPER_ADMIN) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    await this.escrowPayout.retryPayout(jobId, user.id, payoutAccountId);
  }

  async approveCompletion(supabaseUid: string, jobId: string) {
    const user = await this.requireUser(supabaseUid, Role.CLIENT);
    const job = await this.repository.findById(jobId);
    if (!job || job.clientId !== user.id) {
      throw problemException(job ? 'JOB_ACCESS_DENIED' : 'JOB_NOT_FOUND');
    }
    if (job.status === JobStatus.CLOSED) {
      return this.enrichJob(job);
    }
    if (job.status !== JobStatus.COMPLETED) {
      throw problemException('JOB_INVALID_STATUS_TRANSITION');
    }

    await this.escrowService.cancelSilentAcceptance(jobId);
    const manual = this.payoutCfg.mode === 'manual';

    let result: { job: JobDetail; didTransition: boolean } | null;
    try {
      result = await this.repository.approveCompletionAtomically({
        jobId,
        clientId: user.id,
        releaseInTx: async (tx) => {
          await this.escrowRepository.release(jobId, user.id, tx, {
            setPayoutPending: manual,
          });
          await this.escrowRepository.setBullJobId(jobId, null, tx);
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INVALID_ESCROW_TRANSITION') {
        throw problemException('INVALID_ESCROW_TRANSITION');
      }
      throw err;
    }

    if (!result) {
      throw problemException('JOB_INVALID_STATUS_TRANSITION');
    }

    if (result.didTransition) {
      await this.auditJobStatusChange(
        user.id,
        jobId,
        JobStatus.COMPLETED,
        JobStatus.CLOSED,
      );
      if (!manual) {
        await this.escrowPayout.executePayoutForJob(
          jobId,
          user.id,
          PayoutAttemptTrigger.RELEASE_FLOW,
        );
      }
    }

    return this.enrichJob(result.job);
  }

  async createChangeOrder(
    supabaseUid: string,
    jobId: string,
    dto: CreateChangeOrderDto,
  ) {
    const user = await this.requireUser(supabaseUid, Role.INDEPENDENT_PRO);
    const job = await this.repository.findById(jobId);
    if (!job || job.professional?.userId !== user.id) {
      throw problemException(job ? 'JOB_ACCESS_DENIED' : 'JOB_NOT_FOUND');
    }
    if (
      job.status !== JobStatus.IN_PROGRESS &&
      job.status !== JobStatus.ACCEPTED
    ) {
      throw problemException('JOB_INVALID_STATUS_TRANSITION');
    }
    await this.repository.createChangeOrder(
      jobId,
      user.id,
      dto.lines.map((line, index) => ({
        type: line.type,
        label: line.label,
        amountCents: line.amountCents,
        sortOrder: line.sortOrder ?? index,
      })),
    );
    const updated = await this.repository.findById(jobId);
    return this.enrichJob(updated!);
  }

  async patchChangeOrder(
    supabaseUid: string,
    jobId: string,
    changeOrderId: string,
    dto: PatchChangeOrderDto,
  ) {
    const user = await this.requireUser(supabaseUid, Role.CLIENT);
    const job = await this.repository.findById(jobId);
    if (!job || job.clientId !== user.id) {
      throw problemException(job ? 'JOB_ACCESS_DENIED' : 'JOB_NOT_FOUND');
    }
    const co = await this.repository.findChangeOrder(jobId, changeOrderId);
    if (!co) {
      throw problemException('JOB_CHANGE_ORDER_NOT_FOUND');
    }
    if (co.status !== JobChangeOrderStatus.PENDING) {
      throw problemException('JOB_CHANGE_ORDER_INVALID_STATUS');
    }
    let newTotal = job.totalAmountCents;
    if (dto.status === JobChangeOrderStatus.APPROVED) {
      const delta = co.lines.reduce((s, l) => s + l.amountCents, 0);
      newTotal += delta;
    }
    const updated = await this.repository.resolveChangeOrder(
      changeOrderId,
      dto.status,
      dto.clientNote,
      newTotal,
    );
    return this.enrichJob(updated);
  }

  private async enrichJob(job: JobDetail) {
    let equivalentUyuCents: number | null = null;
    if (job.currency.code === 'USD') {
      try {
        const latest = await this.exchangeRatesService.getLatestUsdRate();
        equivalentUyuCents = this.moneyConversion.convertJobAmountToUyuCents(
          job.totalAmountCents,
          'USD',
          latest.sellRateMicros,
        );
      } catch {
        equivalentUyuCents = null;
      }
    }
    return { ...job, equivalentUyuCents };
  }

  private async requireUser(supabaseUid: string, role: Role) {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (!user || user.role !== role) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    return user;
  }

  private async requireJobAccess(
    supabaseUid: string,
    jobId: string,
  ): Promise<JobDetail> {
    const user = await this.repository.findUserBySupabaseUid(supabaseUid);
    if (!user) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const job = await this.repository.findById(jobId);
    if (!job) {
      throw problemException('JOB_NOT_FOUND');
    }
    const isClient = job.clientId === user.id;
    const isPro = job.professional?.userId === user.id;
    if (!isClient && !isPro) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    return job;
  }

  private assertTransition(job: JobDetail, next: JobStatus, role: Role): void {
    if (role === Role.INDEPENDENT_PRO) {
      if (job.status === JobStatus.ACCEPTED && next === JobStatus.IN_PROGRESS) {
        return;
      }
    }
    if (role === Role.CLIENT) {
      if (
        (job.status === JobStatus.ACCEPTED ||
          job.status === JobStatus.PENDING) &&
        next === JobStatus.CANCELLED
      ) {
        return;
      }
    }
    throw problemException('JOB_INVALID_STATUS_TRANSITION');
  }
}
