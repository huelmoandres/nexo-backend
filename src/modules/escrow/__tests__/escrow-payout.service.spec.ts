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
    payoutCfg: typeof payoutCfgGateway | typeof payoutCfgManual = payoutCfgGateway,
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
      makeService(payoutCfgManual).presignManualPayoutReceipt('job-1', {} as never),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_RECEIPT_INVALID_KEY' } });
  });

  it('confirmManualPayout exige receiptStorageKey', async () => {
    await expect(
      makeService(payoutCfgManual).confirmManualPayout('job-1', 'admin', {} as never),
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
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_RECEIPT_INVALID_KEY' } });
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
    payoutRepository.findById.mockResolvedValue({ id: 'acc-1', isActive: false });
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
    payoutRepository.findById.mockResolvedValue({ id: 'acc-1', isActive: true });
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
      makeService(payoutCfgManual).presignManualPayoutReceipt('job-1', {} as never),
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
