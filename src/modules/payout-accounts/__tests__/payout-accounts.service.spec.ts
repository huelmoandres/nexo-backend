import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PayoutIdentifierType,
  PayoutMethod,
  PayoutSubjectType,
} from '@prisma/client';
import { paymentGatewayMock } from '@test/mocks/payment-gateway.mock';
import * as paValidation from '../payout-accounts.validation';
import { PayoutAccountsService } from '../payout-accounts.service';

const baseAccount = {
  id: 'acc-1',
  method: PayoutMethod.MERCADO_PAGO,
  identifierType: PayoutIdentifierType.MP_EMAIL,
  label: 'MP',
  isPrimary: true,
  isActive: true,
  transferIdentifier: 'pro@test.com',
  mpAlias: null,
  accountHolderName: null,
  bank: null,
  bankId: null,
  verifiedAt: new Date('2026-01-01'),
  subjectType: PayoutSubjectType.PROFESSIONAL,
  professionalProfileId: 'pp-1',
  companyId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PayoutAccountsService', () => {
  const repository = {
    listActiveBanks: vi.fn(),
    findBankById: vi.fn(),
    listForProfessional: vi.fn(),
    listForCompany: vi.fn(),
    countActiveForProfessional: vi.fn(),
    countPrimaryForProfessional: vi.fn(),
    createProfessionalAccount: vi.fn(),
    createCompanyAccount: vi.fn(),
    setPrimaryProfessional: vi.fn(),
    setPrimaryCompany: vi.fn(),
    findById: vi.fn(),
    updateAccount: vi.fn(),
    assignJobPayout: vi.fn(),
    setEscrowPayoutAccount: vi.fn(),
  };

  const usersRepository = {
    findBySupabaseUidForMe: vi.fn(),
  };

  const entitlements = { assertCompanyAdmin: vi.fn() };

  const makeService = () =>
    new PayoutAccountsService(
      repository as never,
      usersRepository as never,
      entitlements as never,
      paymentGatewayMock,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentGatewayMock.validatePayoutDestination).mockResolvedValue({
      valid: true,
      providerReference: 'OK',
    });
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      id: 'user-1',
      professionalProfile: { id: 'pp-1' },
    });
  });

  it('listBanks', async () => {
    repository.listActiveBanks.mockResolvedValue([]);
    const svc = makeService();
    await svc.listBanks();
    expect(repository.listActiveBanks).toHaveBeenCalled();
  });

  it('listForCurrentProfessional sin perfil', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      id: 'user-1',
      professionalProfile: null,
    });
    await expect(
      makeService().listForCurrentProfessional('uid'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('listForCurrentProfessional', async () => {
    repository.listForProfessional.mockResolvedValue([baseAccount]);
    const svc = makeService();
    const list = await svc.listForCurrentProfessional('uid');
    expect(list[0]?.maskedIdentifier).toContain('@');
  });

  it('createForCurrentProfessional primera cuenta y swap primary', async () => {
    repository.listForProfessional.mockResolvedValue([
      { ...baseAccount, id: 'old', isPrimary: true },
    ]);
    repository.createProfessionalAccount.mockResolvedValue({
      ...baseAccount,
      id: 'acc-new',
    });
    repository.setPrimaryProfessional.mockResolvedValue({
      ...baseAccount,
      id: 'acc-new',
    });
    repository.findById.mockResolvedValue({ ...baseAccount, id: 'acc-new' });
    const svc = makeService();
    await svc.createForCurrentProfessional('uid', {
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      label: 'MP2',
      transferIdentifier: 'b@test.com',
      isPrimary: true,
    });
    expect(repository.setPrimaryProfessional).toHaveBeenCalled();
  });

  it('createForCurrentProfessional BANK sin banco', async () => {
    repository.listForProfessional.mockResolvedValue([]);
    repository.findBankById.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.createForCurrentProfessional('uid', {
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        label: 'BROU',
        transferIdentifier: '0000003100012345678901',
        accountHolderName: 'Juan Perez',
        bankId: 'bank-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_BANK_NOT_ALLOWED' } });
  });

  it('setPrimary update deactivate company flows', async () => {
    repository.findById.mockImplementation(async (id: string) => ({
      ...baseAccount,
      id,
      professionalProfileId: 'pp-1',
      companyId: id.startsWith('co') ? 'co-1' : null,
      subjectType: id.startsWith('co')
        ? PayoutSubjectType.COMPANY
        : PayoutSubjectType.PROFESSIONAL,
    }));
    repository.setPrimaryProfessional.mockResolvedValue(baseAccount);
    repository.updateAccount.mockResolvedValue({
      ...baseAccount,
      isActive: false,
    });
    repository.countActiveForProfessional.mockResolvedValue(2);
    repository.listForCompany.mockResolvedValue([]);
    repository.createCompanyAccount.mockResolvedValue({
      ...baseAccount,
      id: 'co-acc',
      companyId: 'co-1',
    });
    repository.setPrimaryCompany.mockResolvedValue(baseAccount);
    const svc = makeService();
    await svc.setPrimaryForCurrentProfessional('uid', 'acc-1');
    await svc.updateForCurrentProfessional('uid', 'acc-1', { label: 'Nuevo' });
    await svc.deactivateForCurrentProfessional('uid', 'acc-1');
    repository.listForCompany.mockResolvedValue([
      { ...baseAccount, companyId: 'co-1' },
    ]);
    await svc.listForCompany('uid', 'co-1');
    await svc.createForCompany('uid', 'co-1', {
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      label: 'Empresa',
      transferIdentifier: 'emp@test.com',
    });
    await svc.setPrimaryForCompany('uid', 'co-1', 'co-acc');
  });

  it('gates y ownership', async () => {
    repository.countActiveForProfessional.mockResolvedValue(1);
    repository.countPrimaryForProfessional.mockResolvedValue(1);
    repository.listForProfessional.mockResolvedValue([baseAccount]);
    repository.findById.mockResolvedValue({
      ...baseAccount,
      professionalProfileId: 'other',
    });
    const svc = makeService();
    await svc.assertProfessionalCanAcceptJob('pp-1');
    await expect(
      svc.resolvePayoutAccountId('pp-1', 'acc-x'),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_ACCOUNT_NOT_OWNED' },
    });
    await expect(
      svc.createForCompany('uid', 'co-1', {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        label: 'X',
        transferIdentifier: 'x@y.com',
      }),
    ).resolves.toBeDefined();
    usersRepository.findBySupabaseUidForMe.mockResolvedValue(null);
    await expect(svc.listForCurrentProfessional('uid')).rejects.toMatchObject({
      response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' },
    });
  });

  it('resolve inactive y sin primary', async () => {
    repository.findById.mockResolvedValue({
      ...baseAccount,
      isActive: false,
    });
    const svc = makeService();
    await expect(
      svc.resolvePayoutAccountId('pp-1', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
    repository.listForProfessional.mockResolvedValue([
      { ...baseAccount, isPrimary: false, isActive: true },
    ]);
    await expect(svc.resolvePayoutAccountId('pp-1')).rejects.toMatchObject({
      response: { code: 'PAYOUT_PRIMARY_REQUIRED' },
    });
    repository.findById.mockResolvedValue({
      ...baseAccount,
      companyId: 'wrong',
      subjectType: PayoutSubjectType.COMPANY,
    });
    await expect(
      svc.setPrimaryForCompany('uid', 'co-1', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_OWNED' } });
  });

  it('deactivate única cuenta falla', async () => {
    repository.findById.mockResolvedValue({ ...baseAccount, isPrimary: true });
    repository.countActiveForProfessional.mockResolvedValue(1);
    const svc = makeService();
    await expect(
      svc.deactivateForCurrentProfessional('uid', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_REQUIRED' } });
  });

  it('create sin perfil profesional', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      id: 'user-1',
      professionalProfile: null,
    });
    await expect(
      makeService().createForCurrentProfessional('uid', {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        label: 'MP',
        transferIdentifier: 'a@b.com',
      }),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('create BANK con accountHolderName ausente en payload', async () => {
    vi.spyOn(paValidation, 'validatePayoutFields').mockReturnValue({
      transferIdentifier: '0000003100012345678901',
      mpAlias: null,
    });
    repository.listForProfessional.mockResolvedValue([]);
    repository.findBankById.mockResolvedValue({
      id: 'bank-1',
      code: 'BROU',
      name: 'BROU',
    });
    repository.createProfessionalAccount.mockResolvedValue({
      ...baseAccount,
      method: PayoutMethod.BANK,
      accountHolderName: null,
    });
    await makeService().createForCurrentProfessional('uid', {
      method: PayoutMethod.BANK,
      identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
      label: 'BROU',
      transferIdentifier: '0000003100012345678901',
      bankId: 'bank-1',
    } as never);
  });

  it('createForCurrentProfessional BANK', async () => {
    repository.listForProfessional.mockResolvedValue([]);
    repository.findBankById.mockResolvedValue({
      id: 'bank-1',
      code: 'BROU',
      name: 'BROU',
    });
    repository.createProfessionalAccount.mockResolvedValue({
      ...baseAccount,
      method: PayoutMethod.BANK,
      accountHolderName: 'Juan Perez',
      bank: { id: 'bank-1', code: 'BROU', name: 'BROU' },
    });
    const created = await makeService().createForCurrentProfessional('uid', {
      method: PayoutMethod.BANK,
      identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
      label: 'BROU',
      transferIdentifier: '0000003100012345678901',
      accountHolderName: '  Juan Perez  ',
      bankId: 'bank-1',
    });
    expect(created.bank?.code).toBe('BROU');
  });

  it('create rechaza gateway y primera cuenta sin swap', async () => {
    vi.mocked(
      paymentGatewayMock.validatePayoutDestination,
    ).mockResolvedValueOnce({
      valid: false,
      rejectionReason: 'invalid',
    });
    repository.listForProfessional.mockResolvedValue([]);
    const svc = makeService();
    await expect(
      svc.createForCurrentProfessional('uid', {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        label: 'MP',
        transferIdentifier: 'a@b.com',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_DESTINATION_REJECTED' },
    });
    vi.mocked(paymentGatewayMock.validatePayoutDestination).mockResolvedValue({
      valid: true,
      providerReference: undefined,
    });
    repository.createProfessionalAccount.mockResolvedValue({
      ...baseAccount,
      verifiedAt: null,
    });
    const created = await svc.createForCurrentProfessional('uid', {
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      label: 'MP',
      transferIdentifier: 'a@b.com',
    });
    expect(created.verifiedAt).toBeNull();
    expect(repository.setPrimaryProfessional).not.toHaveBeenCalled();
  });

  it('gates assertProfessionalCanAcceptJob', async () => {
    repository.countActiveForProfessional.mockResolvedValue(0);
    const svc = makeService();
    await expect(
      svc.assertProfessionalCanAcceptJob('pp-1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_ACCOUNT_REQUIRED' },
    });
    repository.countActiveForProfessional.mockResolvedValue(1);
    repository.countPrimaryForProfessional.mockResolvedValue(0);
    await expect(
      svc.assertProfessionalCanAcceptJob('pp-1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_PRIMARY_REQUIRED' },
    });
  });

  it('assertProfessionalOwnership cuenta inexistente', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      makeService().resolvePayoutAccountId('pp-1', 'ghost'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_OWNED' } });
  });

  it('createForCompany BANK sin accountHolderName en dto', async () => {
    vi.spyOn(paValidation, 'validatePayoutFields').mockReturnValue({
      transferIdentifier: '0000003100012345678901',
      mpAlias: null,
    });
    repository.listForCompany.mockResolvedValue([]);
    repository.findBankById.mockResolvedValue({
      id: 'bank-1',
      code: 'BROU',
      name: 'BROU',
    });
    repository.createCompanyAccount.mockResolvedValue({
      ...baseAccount,
      method: PayoutMethod.BANK,
      accountHolderName: null,
      companyId: 'co-1',
    });
    await makeService().createForCompany('uid', 'co-1', {
      method: PayoutMethod.BANK,
      identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
      label: 'Co',
      transferIdentifier: '0000003100012345678901',
      bankId: 'bank-1',
    } as never);
  });

  it('createForCompany BANK con banco válido', async () => {
    repository.listForCompany.mockResolvedValue([]);
    repository.findBankById.mockResolvedValue({
      id: 'bank-1',
      code: 'BROU',
      name: 'BROU',
    });
    repository.createCompanyAccount.mockResolvedValue({
      ...baseAccount,
      id: 'co-bank',
      companyId: 'co-1',
      method: PayoutMethod.BANK,
      accountHolderName: 'Empresa SA',
      bank: { id: 'bank-1', code: 'BROU', name: 'BROU' },
    });
    const created = await makeService().createForCompany('uid', 'co-1', {
      method: PayoutMethod.BANK,
      identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
      label: 'Cuenta empresa',
      transferIdentifier: '0000003100012345678901',
      accountHolderName: '  Empresa SA  ',
      bankId: 'bank-1',
    });
    expect(created.bank?.code).toBe('BROU');
  });

  it('createForCompany rechaza gateway', async () => {
    vi.mocked(
      paymentGatewayMock.validatePayoutDestination,
    ).mockResolvedValueOnce({
      valid: false,
      rejectionReason: 'bad',
    });
    repository.listForCompany.mockResolvedValue([]);
    await expect(
      makeService().createForCompany('uid', 'co-1', {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        label: 'Co',
        transferIdentifier: 'co@test.com',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PAYOUT_DESTINATION_REJECTED' },
    });
  });

  it('setPrimaryForCompany sin usuario', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue(null);
    await expect(
      makeService().setPrimaryForCompany('uid', 'co-1', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('createForCompany swap primary y rechazos', async () => {
    repository.listForCompany.mockResolvedValue([
      { ...baseAccount, isPrimary: true },
    ]);
    repository.createCompanyAccount.mockResolvedValue({
      ...baseAccount,
      id: 'co-new',
    });
    repository.setPrimaryCompany.mockResolvedValue({
      ...baseAccount,
      id: 'co-new',
    });
    repository.findById.mockResolvedValue({ ...baseAccount, id: 'co-new' });
    repository.findBankById.mockResolvedValue(null);
    const svc = makeService();
    await svc.createForCompany('uid', 'co-1', {
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      label: 'Co',
      transferIdentifier: 'co@test.com',
      isPrimary: true,
    });
    await expect(
      svc.createForCompany('uid', 'co-1', {
        method: PayoutMethod.BANK,
        identifierType: PayoutIdentifierType.BANK_TRANSFER_KEY,
        label: 'B',
        transferIdentifier: '0000003100012345678901',
        accountHolderName: 'Empresa SA',
        bankId: 'missing',
      }),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_BANK_NOT_ALLOWED' } });
    usersRepository.findBySupabaseUidForMe.mockResolvedValue(null);
    await expect(
      svc.createForCompany('uid', 'co-1', {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        label: 'X',
        transferIdentifier: 'x@y.com',
      }),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('deactivate no-primary y setPrimary sin usuario', async () => {
    repository.findById.mockResolvedValue({
      ...baseAccount,
      isPrimary: false,
    });
    repository.countActiveForProfessional.mockResolvedValue(2);
    repository.updateAccount.mockResolvedValue({
      ...baseAccount,
      isActive: false,
    });
    const svc = makeService();
    await svc.deactivateForCurrentProfessional('uid', 'acc-1');
    usersRepository.findBySupabaseUidForMe.mockResolvedValue(null);
    await expect(
      svc.setPrimaryForCurrentProfessional('uid', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
    await expect(
      svc.updateForCurrentProfessional('uid', 'acc-1', { label: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
    await expect(
      svc.deactivateForCurrentProfessional('uid', 'acc-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_FOUND' } });
  });

  it('resolvePayoutAccountId con cuenta explícita activa', async () => {
    repository.findById.mockResolvedValue({ ...baseAccount, isActive: true });
    const id = await makeService().resolvePayoutAccountId('pp-1', 'acc-1');
    expect(id).toBe('acc-1');
  });

  it('assertCompanyOwnership cuenta inexistente', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      makeService().setPrimaryForCompany('uid', 'co-1', 'missing'),
    ).rejects.toMatchObject({ response: { code: 'PAYOUT_ACCOUNT_NOT_OWNED' } });
  });

  it('buildSnapshot y gatewayDestination', () => {
    const svc = makeService();
    expect(
      svc.buildSnapshotForAccount({
        ...baseAccount,
        bank: { code: 'BROU', name: 'BROU' },
      }),
    ).toBeDefined();
    expect(
      svc.gatewayDestinationFromAccount({
        ...baseAccount,
        bank: { code: 'BROU' },
      }),
    ).toMatchObject({ bankCode: 'BROU' });
  });
});
