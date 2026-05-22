import { Injectable } from '@nestjs/common';
import {
  JobChangeOrderStatus,
  JobStatus,
  type Job,
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
