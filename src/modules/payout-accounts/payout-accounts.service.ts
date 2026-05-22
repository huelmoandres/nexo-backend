import { Inject, Injectable } from '@nestjs/common';
import {
  PayoutMethod,
  PayoutSubjectType,
  type PayoutAccount,
} from '@prisma/client';
import { problemException } from '@common/errors/problem.factory';
import { EntitlementsService } from '@modules/entitlements/entitlements.service';
import type { IPaymentGateway } from '@modules/payments/payment-gateway.interface';
import { PAYMENT_GATEWAY_TOKEN } from '@modules/payments/payment-gateway.token';
import { UsersRepository } from '@modules/users/users.repository';
import type { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import type { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { PayoutAccountsRepository } from './payout-accounts.repository';
import {
  buildDestinationSnapshot,
  maskTransferIdentifier,
  validatePayoutFields,
} from './payout-accounts.validation';

export type PayoutAccountResponse = {
  id: string;
  method: string;
  identifierType: string;
  label: string;
  isPrimary: boolean;
  isActive: boolean;
  maskedIdentifier: string;
  accountHolderName: string | null;
  bank: { id: string; code: string; name: string } | null;
  verifiedAt: string | null;
};

@Injectable()
export class PayoutAccountsService {
  constructor(
    private readonly repository: PayoutAccountsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly entitlements: EntitlementsService,
    @Inject(PAYMENT_GATEWAY_TOKEN)
    private readonly paymentGateway: IPaymentGateway,
  ) {}

  listBanks() {
    return this.repository.listActiveBanks();
  }

  async listForCurrentProfessional(
    supabaseUid: string,
  ): Promise<PayoutAccountResponse[]> {
    const profileId = await this.requireProfessionalProfileId(supabaseUid);
    const rows = await this.repository.listForProfessional(profileId);
    return rows.map((r) => this.toResponse(r));
  }

  async createForCurrentProfessional(
    supabaseUid: string,
    dto: CreatePayoutAccountDto,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const profileId = user?.professionalProfile?.id;
    if (!profileId || !user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    const validated = validatePayoutFields(dto);
    if (dto.method === PayoutMethod.BANK) {
      const bank = await this.repository.findBankById(dto.bankId!);
      if (!bank) {
        throw problemException('PAYOUT_BANK_NOT_ALLOWED');
      }
    }
    const gatewayCheck = await this.paymentGateway.validatePayoutDestination({
      method: dto.method,
      identifierType: dto.identifierType,
      transferIdentifier: validated.transferIdentifier,
      mpAlias: validated.mpAlias,
      bankCode:
        dto.method === PayoutMethod.BANK && dto.bankId
          ? (await this.repository.findBankById(dto.bankId))?.code
          : undefined,
    });
    if (!gatewayCheck.valid) {
      throw problemException(
        'PAYOUT_DESTINATION_REJECTED',
        gatewayCheck.rejectionReason,
      );
    }
    const existing = await this.repository.listForProfessional(profileId);
    const isPrimary = dto.isPrimary ?? existing.length === 0;
    const created = await this.repository.createProfessionalAccount(
      {
        subjectType: PayoutSubjectType.PROFESSIONAL,
        professionalProfile: { connect: { id: profileId } },
        method: dto.method,
        identifierType: dto.identifierType,
        label: dto.label.trim(),
        isPrimary,
        transferIdentifier: validated.transferIdentifier,
        mpAlias: validated.mpAlias,
        accountHolderName:
          dto.method === PayoutMethod.BANK
            ? (dto.accountHolderName?.trim() ?? null)
            : null,
        bank:
          dto.method === PayoutMethod.BANK && dto.bankId
            ? { connect: { id: dto.bankId } }
            : undefined,
        verifiedAt: gatewayCheck.providerReference ? new Date() : null,
      },
      user.id,
    );
    if (isPrimary && existing.some((a) => a.isPrimary)) {
      await this.repository.setPrimaryProfessional(
        created.id,
        profileId,
        user.id,
      );
      const refreshed = await this.repository.findById(created.id);
      return this.toResponse(refreshed!);
    }
    return this.toResponse(created);
  }

  async setPrimaryForCurrentProfessional(
    supabaseUid: string,
    accountId: string,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const profileId = user?.professionalProfile?.id;
    if (!profileId || !user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    await this.assertProfessionalOwnership(accountId, profileId);
    const updated = await this.repository.setPrimaryProfessional(
      accountId,
      profileId,
      user.id,
    );
    return this.toResponse(updated);
  }

  async updateForCurrentProfessional(
    supabaseUid: string,
    accountId: string,
    dto: UpdatePayoutAccountDto,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const profileId = user?.professionalProfile?.id;
    if (!profileId || !user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    await this.assertProfessionalOwnership(accountId, profileId);
    const updated = await this.repository.updateAccount(
      accountId,
      {
        label: dto.label?.trim(),
        isActive: dto.isActive,
      },
      user.id,
    );
    return this.toResponse(updated);
  }

  async deactivateForCurrentProfessional(
    supabaseUid: string,
    accountId: string,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const profileId = user?.professionalProfile?.id;
    if (!profileId || !user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    const account = await this.assertProfessionalOwnership(
      accountId,
      profileId,
    );
    if (account.isPrimary) {
      const activeCount =
        await this.repository.countActiveForProfessional(profileId);
      if (activeCount <= 1) {
        throw problemException(
          'PAYOUT_ACCOUNT_REQUIRED',
          'No podés desactivar la única cuenta activa.',
        );
      }
    }
    return this.updateForCurrentProfessional(supabaseUid, accountId, {
      isActive: false,
    });
  }

  async listForCompany(
    supabaseUid: string,
    companyId: string,
  ): Promise<PayoutAccountResponse[]> {
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    const rows = await this.repository.listForCompany(companyId);
    return rows.map((r) => this.toResponse(r));
  }

  async createForCompany(
    supabaseUid: string,
    companyId: string,
    dto: CreatePayoutAccountDto,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    const validated = validatePayoutFields(dto);
    if (dto.method === PayoutMethod.BANK && dto.bankId) {
      const bank = await this.repository.findBankById(dto.bankId);
      if (!bank) {
        throw problemException('PAYOUT_BANK_NOT_ALLOWED');
      }
    }
    const gatewayCheck = await this.paymentGateway.validatePayoutDestination({
      method: dto.method,
      identifierType: dto.identifierType,
      transferIdentifier: validated.transferIdentifier,
      mpAlias: validated.mpAlias,
    });
    if (!gatewayCheck.valid) {
      throw problemException(
        'PAYOUT_DESTINATION_REJECTED',
        gatewayCheck.rejectionReason,
      );
    }
    const existing = await this.repository.listForCompany(companyId);
    const isPrimary = dto.isPrimary ?? existing.length === 0;
    const created = await this.repository.createCompanyAccount(
      {
        subjectType: PayoutSubjectType.COMPANY,
        company: { connect: { id: companyId } },
        method: dto.method,
        identifierType: dto.identifierType,
        label: dto.label.trim(),
        isPrimary,
        transferIdentifier: validated.transferIdentifier,
        mpAlias: validated.mpAlias,
        accountHolderName:
          dto.method === PayoutMethod.BANK
            ? (dto.accountHolderName?.trim() ?? null)
            : null,
        bank:
          dto.method === PayoutMethod.BANK && dto.bankId
            ? { connect: { id: dto.bankId } }
            : undefined,
      },
      user.id,
      companyId,
    );
    if (isPrimary && existing.some((a) => a.isPrimary)) {
      await this.repository.setPrimaryCompany(created.id, companyId, user.id);
      const refreshed = await this.repository.findById(created.id);
      return this.toResponse(refreshed!);
    }
    return this.toResponse(created);
  }

  async setPrimaryForCompany(
    supabaseUid: string,
    companyId: string,
    accountId: string,
  ): Promise<PayoutAccountResponse> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    await this.assertCompanyOwnership(accountId, companyId);
    const updated = await this.repository.setPrimaryCompany(
      accountId,
      companyId,
      user.id,
    );
    return this.toResponse(updated);
  }

  async assertProfessionalCanAcceptJob(
    professionalProfileId: string,
    payoutAccountId?: string,
  ): Promise<string> {
    const activeCount = await this.repository.countActiveForProfessional(
      professionalProfileId,
    );
    if (activeCount < 1) {
      throw problemException('PAYOUT_ACCOUNT_REQUIRED');
    }
    const primaryCount = await this.repository.countPrimaryForProfessional(
      professionalProfileId,
    );
    if (primaryCount !== 1) {
      throw problemException('PAYOUT_PRIMARY_REQUIRED');
    }
    return this.resolvePayoutAccountId(professionalProfileId, payoutAccountId);
  }

  async resolvePayoutAccountId(
    professionalProfileId: string,
    payoutAccountId?: string,
  ): Promise<string> {
    if (payoutAccountId) {
      const account = await this.assertProfessionalOwnership(
        payoutAccountId,
        professionalProfileId,
      );
      if (!account.isActive) {
        throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
      }
      return account.id;
    }
    const accounts = await this.repository.listForProfessional(
      professionalProfileId,
    );
    const primary = accounts.find((a) => a.isPrimary && a.isActive);
    if (!primary) {
      throw problemException('PAYOUT_PRIMARY_REQUIRED');
    }
    return primary.id;
  }

  buildSnapshotForAccount(
    account: PayoutAccount & {
      bank: { code: string; name: string } | null;
    },
  ): Record<string, unknown> {
    return buildDestinationSnapshot({
      method: account.method,
      identifierType: account.identifierType,
      transferIdentifier: account.transferIdentifier,
      mpAlias: account.mpAlias,
      accountHolderName: account.accountHolderName,
      bank: account.bank,
    });
  }

  gatewayDestinationFromAccount(
    account: PayoutAccount & { bank?: { code: string } | null },
  ) {
    return {
      method: account.method,
      identifierType: account.identifierType,
      transferIdentifier: account.transferIdentifier,
      mpAlias: account.mpAlias,
      bankCode: account.bank?.code,
    };
  }

  private async requireProfessionalProfileId(
    supabaseUid: string,
  ): Promise<string> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const id = user?.professionalProfile?.id;
    if (!id) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    return id;
  }

  private async assertProfessionalOwnership(
    accountId: string,
    professionalProfileId: string,
  ) {
    const account = await this.repository.findById(accountId);
    if (
      !account ||
      account.professionalProfileId !== professionalProfileId ||
      account.subjectType !== PayoutSubjectType.PROFESSIONAL
    ) {
      throw problemException('PAYOUT_ACCOUNT_NOT_OWNED');
    }
    return account;
  }

  private async assertCompanyOwnership(accountId: string, companyId: string) {
    const account = await this.repository.findById(accountId);
    if (
      !account ||
      account.companyId !== companyId ||
      account.subjectType !== PayoutSubjectType.COMPANY
    ) {
      throw problemException('PAYOUT_ACCOUNT_NOT_OWNED');
    }
    return account;
  }

  private toResponse(
    account: PayoutAccount & {
      bank: { id: string; code: string; name: string } | null;
    },
  ): PayoutAccountResponse {
    return {
      id: account.id,
      method: account.method,
      identifierType: account.identifierType,
      label: account.label,
      isPrimary: account.isPrimary,
      isActive: account.isActive,
      maskedIdentifier: maskTransferIdentifier(
        account.identifierType,
        account.transferIdentifier,
        account.mpAlias,
      ),
      accountHolderName: account.accountHolderName,
      bank: account.bank,
      verifiedAt: account.verifiedAt?.toISOString() ?? null,
    };
  }
}
