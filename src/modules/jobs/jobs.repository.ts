import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  JobChangeOrderStatus,
  JobStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const jobInclude = {
  currency: true,
  priceLines: { orderBy: { sortOrder: 'asc' as const } },
  changeOrders: {
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
    orderBy: { createdAt: 'desc' as const },
  },
  escrowTransaction: true,
  category: { select: { id: true, name: true } },
  professional: { select: { id: true, userId: true } },
} satisfies Prisma.JobInclude;

export type JobDetail = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<JobDetail | null> {
    return this.prisma.job.findFirst({
      where: { id, deletedAt: null },
      include: jobInclude,
    });
  }

  findUserBySupabaseUid(supabaseUid: string) {
    return this.prisma.user.findFirst({
      where: { supabaseUid, deletedAt: null },
      select: {
        id: true,
        role: true,
        professionalProfile: { select: { id: true } },
      },
    });
  }

  async createJob(data: {
    clientId: string;
    categoryId: string;
    currencyId: string;
    pricingMode: Prisma.JobCreateInput['pricingMode'];
    title: string;
    description: string;
    totalAmountCents: number;
    addressLine?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    neighborhoodId?: string;
    latitude?: number;
    longitude?: number;
    priceLines: Array<{
      type: Prisma.JobPriceLineCreateWithoutJobInput['type'];
      label: string;
      amountCents: number;
      sortOrder: number;
    }>;
  }): Promise<JobDetail> {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          clientId: data.clientId,
          categoryId: data.categoryId,
          currencyId: data.currencyId,
          pricingMode: data.pricingMode,
          title: data.title,
          description: data.description,
          totalAmountCents: data.totalAmountCents,
          status: JobStatus.PENDING,
          addressLine: data.addressLine,
          countryId: data.countryId,
          stateId: data.stateId,
          cityId: data.cityId,
          neighborhoodId: data.neighborhoodId,
          latitude: data.latitude,
          longitude: data.longitude,
          priceLines: {
            create: data.priceLines,
          },
        },
        include: jobInclude,
      });
      return job;
    });
  }

  listByClient(clientId: string, skip: number, take: number) {
    return this.prisma.job.findMany({
      where: { clientId, deletedAt: null },
      include: jobInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  listPendingAvailable(skip: number, take: number) {
    return this.prisma.job.findMany({
      where: { status: JobStatus.PENDING, deletedAt: null },
      include: jobInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  listByProfessional(professionalId: string, skip: number, take: number) {
    return this.prisma.job.findMany({
      where: { professionalId, deletedAt: null },
      include: jobInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async assignProfessional(
    jobId: string,
    professionalId: string,
  ): Promise<JobDetail> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        professionalId,
        status: JobStatus.ACCEPTED,
      },
      include: jobInclude,
    });
  }

  async acceptJobAtomically(input: {
    jobId: string;
    professionalId: string;
    payoutAccountId: string;
    auditUserId: string;
  }): Promise<JobDetail | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: {
          id: input.jobId,
          status: JobStatus.PENDING,
          deletedAt: null,
        },
        data: {
          professionalId: input.professionalId,
          payoutAccountId: input.payoutAccountId,
          status: JobStatus.ACCEPTED,
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      await tx.escrowTransaction.upsert({
        where: { jobId: input.jobId },
        update: { payoutAccountId: input.payoutAccountId },
        create: {
          jobId: input.jobId,
          status: 'PENDING',
          amountCents: 0,
          payoutAccountId: input.payoutAccountId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.auditUserId,
          action: AuditAction.JOB_ASSIGNED,
          entityType: 'Job',
          entityId: input.jobId,
          previousState: JSON.stringify({ status: JobStatus.PENDING }),
          newState: JSON.stringify({
            status: JobStatus.ACCEPTED,
            professionalId: input.professionalId,
          }),
        },
      });

      return tx.job.findUnique({
        where: { id: input.jobId },
        include: jobInclude,
      });
    });
  }

  async updateStatus(
    jobId: string,
    status: JobStatus,
    extra?: Partial<{
      completedAt: Date;
      approvalDeadline: Date;
    }>,
  ): Promise<JobDetail> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status, ...extra },
      include: jobInclude,
    });
  }

  /**
   * Cierra el job (COMPLETED → CLOSED) y ejecuta `releaseInTx` en la misma transacción.
   * Idempotente si el job ya está CLOSED para el mismo cliente.
   */
  async approveCompletionAtomically(input: {
    jobId: string;
    clientId: string;
    releaseInTx: (tx: Prisma.TransactionClient) => Promise<void>;
  }): Promise<{ job: JobDetail; didTransition: boolean } | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: {
          id: input.jobId,
          clientId: input.clientId,
          status: JobStatus.COMPLETED,
          deletedAt: null,
        },
        data: { status: JobStatus.CLOSED },
      });

      if (updated.count !== 1) {
        const existing = await tx.job.findFirst({
          where: {
            id: input.jobId,
            clientId: input.clientId,
            status: JobStatus.CLOSED,
            deletedAt: null,
          },
          include: jobInclude,
        });
        if (!existing) {
          return null;
        }
        return { job: existing, didTransition: false };
      }

      await input.releaseInTx(tx);

      const job = await tx.job.findUnique({
        where: { id: input.jobId },
        include: jobInclude,
      });
      if (!job) {
        return null;
      }
      return { job, didTransition: true };
    });
  }

  async createChangeOrder(
    jobId: string,
    proposedById: string,
    lines: Array<{
      type: Prisma.JobChangeOrderLineCreateWithoutChangeOrderInput['type'];
      label: string;
      amountCents: number;
      sortOrder: number;
    }>,
  ) {
    return this.prisma.jobChangeOrder.create({
      data: {
        jobId,
        proposedById,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  }

  findChangeOrder(jobId: string, changeOrderId: string) {
    return this.prisma.jobChangeOrder.findFirst({
      where: { id: changeOrderId, jobId },
      include: { lines: true },
    });
  }

  async resolveChangeOrder(
    changeOrderId: string,
    status: JobChangeOrderStatus,
    clientNote: string | undefined,
    newTotalAmountCents: number,
  ): Promise<JobDetail> {
    return this.prisma.$transaction(async (tx) => {
      const co = await tx.jobChangeOrder.update({
        where: { id: changeOrderId },
        data: { status, clientNote },
      });
      if (status === JobChangeOrderStatus.APPROVED) {
        await tx.job.update({
          where: { id: co.jobId },
          data: { totalAmountCents: newTotalAmountCents },
        });
      }
      return tx.job.findUniqueOrThrow({
        where: { id: co.jobId },
        include: jobInclude,
      });
    });
  }
}
