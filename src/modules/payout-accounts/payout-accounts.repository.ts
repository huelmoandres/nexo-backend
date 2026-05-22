import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  type Bank,
  type PayoutAccount,
  PayoutSubjectType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const accountInclude = {
  bank: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PayoutAccountInclude;

@Injectable()
export class PayoutAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listActiveBanks(): Promise<Bank[]> {
    return this.prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findBankById(id: string): Promise<Bank | null> {
    return this.prisma.bank.findFirst({
      where: { id, isActive: true },
    });
  }

  listForProfessional(professionalProfileId: string) {
    return this.prisma.payoutAccount.findMany({
      where: {
        professionalProfileId,
        subjectType: PayoutSubjectType.PROFESSIONAL,
      },
      include: accountInclude,
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  listForCompany(companyId: string) {
    return this.prisma.payoutAccount.findMany({
      where: { companyId, subjectType: PayoutSubjectType.COMPANY },
      include: accountInclude,
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.payoutAccount.findUnique({
      where: { id },
      include: accountInclude,
    });
  }

  countActiveForProfessional(professionalProfileId: string): Promise<number> {
    return this.prisma.payoutAccount.count({
      where: {
        professionalProfileId,
        subjectType: PayoutSubjectType.PROFESSIONAL,
        isActive: true,
      },
    });
  }

  countPrimaryForProfessional(professionalProfileId: string): Promise<number> {
    return this.prisma.payoutAccount.count({
      where: {
        professionalProfileId,
        subjectType: PayoutSubjectType.PROFESSIONAL,
        isActive: true,
        isPrimary: true,
      },
    });
  }

  async createProfessionalAccount(
    data: Prisma.PayoutAccountCreateInput,
    auditUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.create({
        data,
        include: accountInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ACCOUNT_CREATED,
          userId: auditUserId,
          entityType: 'PayoutAccount',
          entityId: account.id,
          newState: JSON.stringify({ id: account.id, method: account.method }),
        },
      });
      return account;
    });
  }

  async setPrimaryProfessional(
    accountId: string,
    professionalProfileId: string,
    auditUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.payoutAccount.updateMany({
        where: {
          professionalProfileId,
          subjectType: PayoutSubjectType.PROFESSIONAL,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
      const account = await tx.payoutAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
        include: accountInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ACCOUNT_SET_PRIMARY,
          userId: auditUserId,
          entityType: 'PayoutAccount',
          entityId: accountId,
        },
      });
      return account;
    });
  }

  async createCompanyAccount(
    data: Prisma.PayoutAccountCreateInput,
    auditUserId: string,
    companyId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.create({
        data,
        include: accountInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ACCOUNT_CREATED,
          userId: auditUserId,
          companyId,
          entityType: 'PayoutAccount',
          entityId: account.id,
          newState: JSON.stringify({ id: account.id }),
        },
      });
      return account;
    });
  }

  async setPrimaryCompany(
    accountId: string,
    companyId: string,
    auditUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.payoutAccount.updateMany({
        where: {
          companyId,
          subjectType: PayoutSubjectType.COMPANY,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
      const account = await tx.payoutAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
        include: accountInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ACCOUNT_SET_PRIMARY,
          userId: auditUserId,
          companyId,
          entityType: 'PayoutAccount',
          entityId: accountId,
        },
      });
      return account;
    });
  }

  updateAccount(
    id: string,
    data: Prisma.PayoutAccountUpdateInput,
    auditUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.update({
        where: { id },
        data,
        include: accountInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ACCOUNT_UPDATED,
          userId: auditUserId,
          entityType: 'PayoutAccount',
          entityId: id,
        },
      });
      return account;
    });
  }

  assignJobPayout(jobId: string, payoutAccountId: string) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { payoutAccountId },
    });
  }

  setEscrowPayoutAccount(jobId: string, payoutAccountId: string) {
    return this.prisma.escrowTransaction.update({
      where: { jobId },
      data: { payoutAccountId },
    });
  }
}
