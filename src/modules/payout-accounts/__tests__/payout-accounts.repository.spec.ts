import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditAction, PayoutSubjectType } from '@prisma/client';
import { PayoutAccountsRepository } from '../payout-accounts.repository';

function makeTx() {
  return {
    payoutAccount: {
      create: vi.fn().mockResolvedValue({ id: 'acc-1' }),
      update: vi
        .fn()
        .mockResolvedValue({ id: 'acc-1', method: 'MERCADO_PAGO' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('PayoutAccountsRepository', () => {
  const tx = makeTx();
  const prisma = {
    bank: { findMany: vi.fn(), findFirst: vi.fn() },
    payoutAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    job: { update: vi.fn() },
    escrowTransaction: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (c: typeof tx) => unknown) => fn(tx)),
  };

  const repo = new PayoutAccountsRepository(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(tx, makeTx());
    prisma.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) =>
      fn(tx),
    );
  });

  it('findById', async () => {
    prisma.payoutAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
    await repo.findById('acc-1');
    expect(prisma.payoutAccount.findUnique).toHaveBeenCalled();
  });

  it('listActiveBanks y findBankById', async () => {
    prisma.bank.findMany.mockResolvedValue([]);
    prisma.bank.findFirst.mockResolvedValue({ id: 'b1' });
    await repo.listActiveBanks();
    await repo.findBankById('b1');
  });

  it('listForProfessional y listForCompany', async () => {
    prisma.payoutAccount.findMany.mockResolvedValue([]);
    await repo.listForProfessional('pp-1');
    await repo.listForCompany('co-1');
  });

  it('counts', async () => {
    prisma.payoutAccount.count.mockResolvedValue(1);
    await repo.countActiveForProfessional('pp-1');
    await repo.countPrimaryForProfessional('pp-1');
  });

  it('createProfessionalAccount en transacción', async () => {
    tx.payoutAccount.create.mockResolvedValue({
      id: 'acc-1',
      method: 'MERCADO_PAGO',
    });
    await repo.createProfessionalAccount(
      {
        subjectType: PayoutSubjectType.PROFESSIONAL,
        label: 'x',
        method: 'MERCADO_PAGO',
        identifierType: 'MP_EMAIL',
      } as never,
      'user-1',
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.PAYOUT_ACCOUNT_CREATED,
        }),
      }),
    );
  });

  it('setPrimaryProfessional', async () => {
    tx.payoutAccount.update.mockResolvedValue({ id: 'acc-1', method: 'MP' });
    await repo.setPrimaryProfessional('acc-1', 'pp-1', 'user-1');
    expect(tx.payoutAccount.updateMany).toHaveBeenCalled();
  });

  it('createCompanyAccount y setPrimaryCompany', async () => {
    tx.payoutAccount.create.mockResolvedValue({ id: 'acc-2', method: 'MP' });
    tx.payoutAccount.update.mockResolvedValue({ id: 'acc-2', method: 'MP' });
    await repo.createCompanyAccount({ label: 'c' } as never, 'user-1', 'co-1');
    await repo.setPrimaryCompany('acc-2', 'co-1', 'user-1');
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('updateAccount', async () => {
    tx.payoutAccount.update.mockResolvedValue({ id: 'acc-1', method: 'MP' });
    await repo.updateAccount('acc-1', { label: 'n' }, 'user-1');
  });

  it('assignJobPayout y setEscrowPayoutAccount', async () => {
    prisma.job.update.mockResolvedValue({});
    prisma.escrowTransaction.update.mockResolvedValue({});
    await repo.assignJobPayout('job-1', 'acc-1');
    await repo.setEscrowPayoutAccount('job-1', 'acc-1');
  });
});
