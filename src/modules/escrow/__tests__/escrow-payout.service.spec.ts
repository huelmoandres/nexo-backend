import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EscrowPayoutStatus,
  EscrowStatus,
  PayoutAttemptTrigger,
  PayoutMethod,
  PayoutIdentifierType,
} from '@prisma/client';
import { paymentGatewayMock } from '@test/mocks/payment-gateway.mock';
import { buildPayoutReceiptKey } from '@modules/storage/storage-paths';
import { EscrowPayoutService } from '../escrow-payout.service';

describe('EscrowPayoutService', () => {
  const escrowRepository = {
    findWithPayoutAccount: vi.fn(),
    findByJobId: vi.fn(),
    listRecoverableGatewayPayouts: vi.fn(),
    listStuckPayoutAttempts: vi.fn(),
    countPayoutAttempts: vi.fn(),
    createPayoutAttempt: vi.fn(),
    completePayoutAttempt: vi.fn(),
    listPendingManualPayouts: vi.fn(),
    countPendingManualPayouts: vi.fn(),
  };

  const payoutAccounts = {
    resolvePayoutAccountId: vi.fn(),
    buildSnapshotForAccount: vi.fn(),
    gatewayDestinationFromAccount: vi.fn(),
  };

  const payoutRepository = { findById: vi.fn() };

  const prisma = {
    job: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  const storage = {
    generatePresignedPutUrl: vi.fn(),
    assertObjectExists: vi.fn(),
  };

  const payoutCfgManual = { mode: 'manual' as const, maxPayoutAttempts: 5 };
  const payoutCfgGateway = { mode: 'gateway' as const, maxPayoutAttempts: 5 };

  const makeService = (
    payoutCfg:
      | typeof payoutCfgGateway
      | typeof payoutCfgManual = payoutCfgGateway,
  ) =>
    new EscrowPayoutService(
      escrowRepository as never,
      payoutAccounts as never,
      payoutRepository as never,
      prisma as never,
      paymentGatewayMock,
      payoutCfg as never,
      storage as never,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentGatewayMock.issuePayout).mockResolvedValue({
      success: true,
      providerReference: 'MOCK-PAYOUT',
      providerStatus: 'approved',
    });
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValue(null);
  });

  it('executePayoutForJob en modo manual es no-op', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
    });
    await makeService(payoutCfgManual).executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
  });

  it('executePayoutForJob crea intento y marca SUCCEEDED', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.NOT_APPLICABLE,
      payoutAccountId: 'acc-1',
      amountCents: 100000,
      netAmountCents: 90000,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({ masked: 'x' });
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
    });
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-1' });
    const svc = makeService();
    await svc.executePayoutForJob(
      'job-1',
      'user-1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(paymentGatewayMock.issuePayout).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'payout:esc-1:attempt:1',
      }),
    );
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-1',
      'esc-1',
      expect.objectContaining({ status: 'SUCCEEDED' }),
      'user-1',
    );
  });

  it('executePayoutForJob marca FAILED si gateway falla', async () => {
    vi.mocked(paymentGatewayMock.issuePayout).mockResolvedValueOnce({
      success: false,
      failureCode: 'INVALID',
      failureMessage: 'cuenta inválida',
    });
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 100000,
      netAmountCents: 90000,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-2' });
    const svc = makeService();
    await svc.executePayoutForJob(
      'job-1',
      'user-1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-2',
      'esc-1',
      expect.objectContaining({ status: 'FAILED' }),
      'user-1',
    );
  });

  it('executePayoutForJob persiste FAILED si gateway lanza excepción', async () => {
    vi.mocked(paymentGatewayMock.issuePayout).mockRejectedValueOnce(
      new Error('gateway down'),
    );
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 100000,
      netAmountCents: 90000,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-err' });

    await expect(
      makeService().executePayoutForJob(
        'job-1',
        'user-1',
        PayoutAttemptTrigger.RELEASE_FLOW,
      ),
    ).rejects.toThrow('gateway down');
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-err',
      'esc-1',
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'PAYOUT_GATEWAY_ERROR',
      }),
      'user-1',
    );
  });

  it('executePayoutForJob persiste FAILED con mensaje default si gateway lanza no-Error', async () => {
    vi.mocked(paymentGatewayMock.issuePayout).mockRejectedValueOnce('gw-string');
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 100000,
      netAmountCents: 90000,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-err-s' });

    await expect(
      makeService().executePayoutForJob(
        'job-1',
        'user-1',
        PayoutAttemptTrigger.RELEASE_FLOW,
      ),
    ).rejects.toBe('gw-string');
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-err-s',
      'esc-1',
      expect.objectContaining({
        status: 'FAILED',
        failureMessage: 'issuePayout failed',
      }),
      'user-1',
    );
  });

  it('listAttemptsForJob sin escrow', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.listAttemptsForJob('job-1')).rejects.toMatchObject({
      response: { code: 'ESCROW_NOT_FOUND' },
    });
  });

  it('executePayout max attempts', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 1,
      netAmountCents: 1,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(5);
    const svc = makeService();
    await expect(
      svc.executePayoutForJob('job-1', 'u1', PayoutAttemptTrigger.RELEASE_FLOW),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_MAX_ATTEMPTS' } });
  });

  it('retryPayout ok', async () => {
    escrowRepository.findByJobId.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
    });
    prisma.auditLog.create.mockResolvedValue({});
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(1);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-2' });
    const svc = makeService();
    await svc.retryPayout('job-1', 'admin-1');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('listAttemptsForJob mapea intentos', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      payoutAttempts: [
        {
          id: 'a1',
          attemptNumber: 1,
          status: 'SUCCEEDED',
          amountCents: 100,
          netAmountCents: 90,
          destinationSnapshot: {},
          providerReference: 'ref',
          failureCode: null,
          failureMessage: null,
          triggeredBy: 'RELEASE_FLOW',
          createdAt: new Date('2026-01-01'),
          completedAt: new Date('2026-01-02'),
        },
        {
          id: 'a2',
          attemptNumber: 2,
          status: 'FAILED',
          amountCents: 100,
          netAmountCents: 90,
          destinationSnapshot: {},
          providerReference: null,
          failureCode: 'X',
          failureMessage: 'm',
          triggeredBy: 'ADMIN_RETRY',
          createdAt: new Date('2026-01-03'),
          completedAt: null,
        },
      ],
    });
    const rows = await makeService().listAttemptsForJob('job-1');
    expect(rows[0]!.completedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(rows[1]!.completedAt).toBeNull();
  });

  it('executePayoutForJob no-op si no RELEASED o ya SUCCEEDED', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      status: EscrowStatus.HELD,
      payoutStatus: EscrowPayoutStatus.NOT_APPLICABLE,
    });
    await makeService().executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.SUCCEEDED,
    });
    await makeService().executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
  });

  it('executePayoutForJob sin professional', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 1,
      netAmountCents: 1,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: null });
    await makeService().executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
  });

  it('executePayoutForJob cuenta inactiva', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: 'acc-1',
      amountCents: 1,
      netAmountCents: 1,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: false,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    await expect(
      makeService().executePayoutForJob(
        'job-1',
        'u1',
        PayoutAttemptTrigger.RELEASE_FLOW,
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('retryPayout sin escrow', async () => {
    escrowRepository.findByJobId.mockResolvedValue(null);
    await expect(
      makeService().retryPayout('job-1', 'admin-1'),
    ).rejects.toMatchObject({
      response: { code: 'ESCROW_NOT_FOUND' },
    });
  });

  it('executePayout resuelve cuenta desde escrow sin payoutAccountId', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: null,
      amountCents: 100,
      netAmountCents: 90,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutAccounts.resolvePayoutAccountId.mockResolvedValue('acc-primary');
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-primary',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-4' });
    await makeService().executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.RELEASE_FLOW,
    );
    expect(payoutAccounts.resolvePayoutAccountId).toHaveBeenCalledWith('pp-1');
  });

  it('executePayout con overridePayoutAccountId', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.FAILED,
      payoutAccountId: null,
      amountCents: 100,
      netAmountCents: 90,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutAccounts.resolvePayoutAccountId.mockResolvedValue('acc-2');
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-2',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-3' });
    await makeService().executePayoutForJob(
      'job-1',
      'u1',
      PayoutAttemptTrigger.ADMIN_RETRY,
      'acc-2',
    );
    expect(payoutAccounts.resolvePayoutAccountId).toHaveBeenCalled();
  });

  it('retryPayout exige FAILED', async () => {
    escrowRepository.findByJobId.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.SUCCEEDED,
    });
    const svc = makeService();
    await expect(svc.retryPayout('job-1', 'admin-1')).rejects.toMatchObject({
      response: { code: 'PAYOUT_NOT_RETRYABLE' },
    });
  });

  it('retryPayout en modo manual rechaza', async () => {
    await expect(
      makeService(payoutCfgManual).retryPayout('job-1', 'admin-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_MANUAL_ONLY' } });
  });

  it('recoverPendingGatewayPayouts no-op en modo manual', async () => {
    const result =
      await makeService(payoutCfgManual).recoverPendingGatewayPayouts();
    expect(result.recovered).toBe(0);
    expect(
      escrowRepository.listRecoverableGatewayPayouts,
    ).not.toHaveBeenCalled();
  });

  it('recoverPendingGatewayPayouts ejecuta SYSTEM_RETRY', async () => {
    escrowRepository.listRecoverableGatewayPayouts.mockResolvedValue([
      { job: { id: 'job-1', clientId: 'client-1' } },
      { job: { id: 'job-2', clientId: 'client-2' } },
    ]);
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
      payoutAttempts: [],
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    payoutAccounts.gatewayDestinationFromAccount.mockReturnValue({});
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-1' });

    const result =
      await makeService(payoutCfgGateway).recoverPendingGatewayPayouts();
    expect(result.recovered).toBe(2);
    expect(escrowRepository.listRecoverableGatewayPayouts).toHaveBeenCalledWith(
      {
        take: 25,
      },
    );
    expect(escrowRepository.createPayoutAttempt).toHaveBeenCalledTimes(2);
    expect(escrowRepository.createPayoutAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        triggeredBy: PayoutAttemptTrigger.SYSTEM_RETRY,
      }),
      'client-1',
    );
  });

  it('recoverStuckPayoutAttempts usa reconciliación por idempotencyKey', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-p',
        attemptNumber: 2,
        status: 'PENDING',
        providerReference: 'mp-partial-1',
        destinationSnapshot: {},
        triggeredByUserId: 'client-1',
        escrowTransaction: {
          id: 'esc-1',
          amountCents: 100,
          netAmountCents: 90,
          status: EscrowStatus.RELEASED,
        },
      },
    ]);
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValue({
      success: true,
      providerReference: 'mp-1',
      providerStatus: 'approved',
    });

    const result =
      await makeService(payoutCfgGateway).recoverStuckPayoutAttempts();
    expect(result.recovered).toBe(1);
    expect(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).toHaveBeenCalledWith({
      escrowTransactionId: 'esc-1',
      idempotencyKey: 'payout:esc-1:attempt:2',
      providerReference: 'mp-partial-1',
    });
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-p',
      'esc-1',
      expect.objectContaining({ status: 'SUCCEEDED' }),
      'client-1',
    );
  });

  it('recoverPendingGatewayPayouts ignora filas sin job válido', async () => {
    escrowRepository.listRecoverableGatewayPayouts.mockResolvedValue([
      { job: null },
      { job: { id: 'job-2', clientId: null } },
    ]);
    const result =
      await makeService(payoutCfgGateway).recoverPendingGatewayPayouts();
    expect(result).toEqual({ recovered: 0 });
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
  });

  it('recoverStuckPayoutAttempts en modo manual retorna 0', async () => {
    const result =
      await makeService(payoutCfgManual).recoverStuckPayoutAttempts();
    expect(result).toEqual({ recovered: 0 });
    expect(escrowRepository.listStuckPayoutAttempts).not.toHaveBeenCalled();
  });

  it('recoverStuckPayoutAttempts marca FAILED cuando reconcile devuelve fallo terminal', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-failed',
        attemptNumber: 2,
        status: 'PENDING',
        providerReference: 'mp-r',
        destinationSnapshot: {},
        triggeredByUserId: 'u-1',
        escrowTransaction: {
          id: 'esc-3',
          amountCents: 100,
          netAmountCents: 90,
          status: EscrowStatus.RELEASED,
        },
      },
    ]);
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValueOnce({
      success: false,
      failureCode: 'MP_PAYOUT_REJECTED',
      failureMessage: 'rejected',
    });

    const result =
      await makeService(payoutCfgGateway).recoverStuckPayoutAttempts();
    expect(result).toEqual({ recovered: 1 });
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-failed',
      'esc-3',
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'MP_PAYOUT_REJECTED',
      }),
      'u-1',
    );
  });

  it('recoverStuckPayoutAttempts usa issuePayout cuando reconcile devuelve null y marca success', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-issue',
        attemptNumber: 1,
        status: 'PENDING',
        providerReference: null,
        destinationSnapshot: {},
        triggeredByUserId: 'user-issue',
        escrowTransaction: {
          id: 'esc-issue',
          amountCents: 120,
          netAmountCents: 100,
          status: EscrowStatus.RELEASED,
        },
      },
    ]);
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValueOnce(null);
    vi.mocked(paymentGatewayMock.issuePayout).mockResolvedValueOnce({
      success: true,
      providerReference: 'mp-issue-1',
      providerStatus: 'approved',
    });

    await expect(
      makeService(payoutCfgGateway).recoverStuckPayoutAttempts(),
    ).resolves.toEqual({ recovered: 1 });
    expect(paymentGatewayMock.issuePayout).toHaveBeenCalled();
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-issue',
      'esc-issue',
      expect.objectContaining({
        status: 'SUCCEEDED',
        providerReference: 'mp-issue-1',
      }),
      'user-issue',
    );
  });

  it('recoverStuckPayoutAttempts omite intentos sin escrow.id', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-empty',
        attemptNumber: 1,
        providerReference: null,
        destinationSnapshot: {},
        triggeredByUserId: null,
        escrowTransaction: null,
      },
    ]);
    const result =
      await makeService(payoutCfgGateway).recoverStuckPayoutAttempts();
    expect(result.recovered).toBe(0);
    expect(paymentGatewayMock.issuePayout).not.toHaveBeenCalled();
    expect(escrowRepository.completePayoutAttempt).not.toHaveBeenCalled();
  });

  it('recoverStuckPayoutAttempts usa fallback auditUserId=system y marca FAILED al lanzar gateway', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-fail',
        attemptNumber: 3,
        status: 'PENDING',
        providerReference: null,
        destinationSnapshot: {},
        triggeredByUserId: null,
        escrowTransaction: {
          id: 'esc-2',
          amountCents: 100,
          netAmountCents: 90,
          status: EscrowStatus.RELEASED,
        },
      },
    ]);
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValueOnce(null);
    vi.mocked(paymentGatewayMock.issuePayout).mockRejectedValueOnce(
      'gw-string',
    );
    const result =
      await makeService(payoutCfgGateway).recoverStuckPayoutAttempts();
    expect(result.recovered).toBe(1);
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-fail',
      'esc-2',
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'PAYOUT_GATEWAY_ERROR',
        failureMessage: 'issuePayout failed',
      }),
      'system',
    );
  });

  it('recoverStuckPayoutAttempts marca FAILED con mensaje de Error cuando issuePayout lanza Error', async () => {
    escrowRepository.listStuckPayoutAttempts.mockResolvedValue([
      {
        id: 'att-fail-err',
        attemptNumber: 4,
        status: 'PENDING',
        providerReference: null,
        destinationSnapshot: {},
        triggeredByUserId: 'u-err',
        escrowTransaction: {
          id: 'esc-err',
          amountCents: 100,
          netAmountCents: 90,
          status: EscrowStatus.RELEASED,
        },
      },
    ]);
    vi.mocked(
      paymentGatewayMock.reconcilePayoutByIdempotencyKey,
    ).mockResolvedValueOnce(null);
    vi.mocked(paymentGatewayMock.issuePayout).mockRejectedValueOnce(
      new Error('gw-error-msg'),
    );
    await makeService(payoutCfgGateway).recoverStuckPayoutAttempts();
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-fail-err',
      'esc-err',
      expect.objectContaining({
        status: 'FAILED',
        failureMessage: 'gw-error-msg',
      }),
      'u-err',
    );
  });

  it('listPendingManualPayouts usa page y limit por defecto', async () => {
    escrowRepository.listPendingManualPayouts.mockResolvedValue([]);
    escrowRepository.countPendingManualPayouts.mockResolvedValue(0);

    const res = await makeService(payoutCfgManual).listPendingManualPayouts(
      {} as never,
    );

    expect(escrowRepository.listPendingManualPayouts).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
    });
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
  });

  it('listPendingManualPayouts pagina y mapea filas', async () => {
    escrowRepository.listPendingManualPayouts.mockResolvedValue([
      {
        id: 'esc-1',
        jobId: 'job-1',
        amountCents: 100,
        commissionCents: 10,
        netAmountCents: 90,
        providerReference: 'chk-1',
        payoutStatus: EscrowPayoutStatus.PENDING,
        releasedAt: new Date('2026-01-01'),
        payoutAccount: null,
        job: {
          title: 'Obra',
          client: { id: 'c1', email: 'c@x.com', fullName: 'Cliente' },
          professional: {
            id: 'pp-1',
            user: { id: 'u1', email: 'p@x.com', fullName: 'Pro' },
          },
        },
      },
    ]);
    escrowRepository.countPendingManualPayouts.mockResolvedValue(1);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({ masked: 'x' });

    const res = await makeService(payoutCfgManual).listPendingManualPayouts({
      page: 2,
      limit: 5,
    } as never);

    expect(escrowRepository.listPendingManualPayouts).toHaveBeenCalledWith({
      skip: 5,
      take: 5,
    });
    expect(res.total).toBe(1);
    expect(res.items[0]?.client?.email).toBe('c@x.com');
    expect(res.items[0]?.destinationSnapshot).toBeNull();
  });

  it('listPendingManualPayouts mapea snapshot y relaciones opcionales', async () => {
    escrowRepository.listPendingManualPayouts.mockResolvedValue([
      {
        id: 'esc-2',
        jobId: 'job-2',
        amountCents: 200,
        commissionCents: 20,
        netAmountCents: 180,
        providerReference: null,
        payoutStatus: EscrowPayoutStatus.PENDING,
        releasedAt: null,
        payoutAccount: {
          id: 'acc-1',
          method: PayoutMethod.MERCADO_PAGO,
          identifierType: PayoutIdentifierType.MP_CVU,
          transferIdentifier: '1234567890123456789012',
          mpAlias: null,
          accountHolderName: null,
          bank: null,
        },
        job: {
          title: 'Sin partes',
          client: null,
          professional: { id: 'pp-2', user: null },
        },
      },
    ]);
    escrowRepository.countPendingManualPayouts.mockResolvedValue(1);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({ masked: 'acc' });

    const res = await makeService(payoutCfgManual).listPendingManualPayouts({
      page: 1,
      limit: 10,
    } as never);

    expect(res.items[0]?.destinationSnapshot).toEqual({ masked: 'acc' });
    expect(res.items[0]?.client).toBeNull();
    expect(res.items[0]?.professional).toBeNull();
    expect(res.items[0]?.releasedAt).toBeNull();
    expect(payoutAccounts.buildSnapshotForAccount).toHaveBeenCalled();
  });

  it('presignManualPayoutReceipt genera URL', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
    });
    storage.generatePresignedPutUrl.mockResolvedValue({
      uploadUrl: 'https://upload',
      key: buildPayoutReceiptKey(escrowId, 'pdf'),
    });

    const res = await makeService(payoutCfgManual).presignManualPayoutReceipt(
      'job-1',
      { contentType: 'application/pdf', fileExtension: 'pdf' } as never,
    );

    expect(res.uploadUrl).toBe('https://upload');
    expect(res.receiptStorageKey).toContain(escrowId);
  });

  it('presignManualPayoutReceipt rechaza extensión inválida', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
    });
    await expect(
      makeService(payoutCfgManual).presignManualPayoutReceipt(
        'job-1',
        {} as never,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_RECEIPT_INVALID_KEY' },
    });
  });

  it('confirmManualPayout exige receiptStorageKey', async () => {
    await expect(
      makeService(payoutCfgManual).confirmManualPayout(
        'job-1',
        'admin',
        {} as never,
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_RECEIPT_REQUIRED' } });
  });

  it('confirmManualPayout rechaza escrow no confirmable si payout ya SUCCEEDED', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.SUCCEEDED,
    });
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
        receiptStorageKey: 'k',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_NOT_CONFIRMABLE' } });
  });

  it('confirmManualPayout rechaza key inválida', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: 'esc-1',
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
    });
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
        receiptStorageKey: 'bad-key',
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_RECEIPT_INVALID_KEY' },
    });
  });

  it('confirmManualPayout rechaza sin profesional en job', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: null });
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
        receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('confirmManualPayout rechaza cuenta inactiva', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: false,
    });
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
        receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('confirmManualPayout rechaza max intentos', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(5);
    storage.assertObjectExists.mockResolvedValue(undefined);
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
        receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_MAX_ATTEMPTS' } });
  });

  it('presign y confirm rechazan escrow no encontrado', async () => {
    escrowRepository.findWithPayoutAccount.mockResolvedValue(null);
    await expect(
      makeService(payoutCfgManual).presignManualPayoutReceipt(
        'job-1',
        {} as never,
      ),
    ).rejects.toMatchObject({ response: { code: 'ESCROW_NOT_FOUND' } });
  });

  it('confirmManualPayout resuelve cuenta si escrow sin payoutAccountId', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: null,
      amountCents: 100,
      netAmountCents: 90,
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutAccounts.resolvePayoutAccountId.mockResolvedValue('acc-resolved');
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-resolved',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_CVU,
      transferIdentifier: '1234567890123456789012',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    storage.assertObjectExists.mockResolvedValue(undefined);
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-r' });
    escrowRepository.completePayoutAttempt.mockResolvedValue({
      id: 'att-r',
      attemptNumber: 1,
      status: 'SUCCEEDED',
      providerReference: null,
      receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      completedAt: new Date(),
    });
    const key = buildPayoutReceiptKey(escrowId, 'pdf');
    await makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {
      receiptStorageKey: key,
    } as never);
    expect(payoutAccounts.resolvePayoutAccountId).toHaveBeenCalledWith('pp-1');
  });

  it('confirmManualPayout exige comprobante en storage', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100000,
      netAmountCents: 95000,
      payoutAttempts: [],
      payoutAccount: {
        id: 'acc-1',
        isActive: true,
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_CVU,
        transferIdentifier: '1234567890123456789012',
        mpAlias: null,
        accountHolderName: null,
        bank: null,
      },
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_CVU,
      transferIdentifier: '1234567890123456789012',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({ masked: 'x' });
    storage.assertObjectExists.mockResolvedValue(undefined);
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-m' });
    escrowRepository.completePayoutAttempt.mockResolvedValue({
      id: 'att-m',
      attemptNumber: 1,
      status: 'SUCCEEDED',
      providerReference: 'mp-tr-1',
      receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      completedAt: new Date(),
    });
    const key = buildPayoutReceiptKey(escrowId, 'pdf');
    const result = await makeService(payoutCfgManual).confirmManualPayout(
      'job-1',
      'admin-1',
      { receiptStorageKey: key, providerReference: 'mp-tr-1' },
    );
    expect(storage.assertObjectExists).toHaveBeenCalledWith(key);
    expect(result.payoutStatus).toBe(EscrowPayoutStatus.SUCCEEDED);
  });

  it('confirmManualPayout omite providerReference vacío y completedAt null', async () => {
    const escrowId = '550e8400-e29b-41d4-a716-446655440000';
    escrowRepository.findWithPayoutAccount.mockResolvedValue({
      id: escrowId,
      status: EscrowStatus.RELEASED,
      payoutStatus: EscrowPayoutStatus.PENDING,
      payoutAccountId: 'acc-1',
      amountCents: 100,
      netAmountCents: 90,
    });
    prisma.job.findUnique.mockResolvedValue({ professionalId: 'pp-1' });
    payoutRepository.findById.mockResolvedValue({
      id: 'acc-1',
      isActive: true,
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_CVU,
      transferIdentifier: '1234567890123456789012',
      mpAlias: null,
      accountHolderName: null,
      bank: null,
    });
    escrowRepository.countPayoutAttempts.mockResolvedValue(0);
    payoutAccounts.buildSnapshotForAccount.mockReturnValue({});
    storage.assertObjectExists.mockResolvedValue(undefined);
    escrowRepository.createPayoutAttempt.mockResolvedValue({ id: 'att-x' });
    escrowRepository.completePayoutAttempt.mockResolvedValue({
      id: 'att-x',
      attemptNumber: 1,
      status: 'SUCCEEDED',
      providerReference: null,
      receiptStorageKey: buildPayoutReceiptKey(escrowId, 'pdf'),
      completedAt: null,
    });
    const key = buildPayoutReceiptKey(escrowId, 'pdf');
    const result = await makeService(payoutCfgManual).confirmManualPayout(
      'job-1',
      'admin-1',
      {
        receiptStorageKey: key,
        providerReference: '   ',
        note: '  nota admin  ',
      },
    );
    expect(result.attempt.completedAt).toBeNull();
    expect(escrowRepository.completePayoutAttempt).toHaveBeenCalledWith(
      'att-x',
      escrowId,
      expect.objectContaining({
        providerReference: undefined,
        adminPayoutNote: 'nota admin',
      }),
      'admin-1',
    );
  });
});
