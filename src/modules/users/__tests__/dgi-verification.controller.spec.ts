import { describe, expect, it, vi } from 'vitest';
import { Role, VerificationSubjectType } from '@prisma/client';
import { DgiVerificationController } from '../dgi-verification.controller';

describe('DgiVerificationController', () => {
  const makeAuthz = (role: Role = Role.COMPANY_ADMIN) => ({
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const makeDgi = () => ({
    presignVerificationDocument: vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://u', key: 'k' }),
    submitVerification: vi.fn().mockResolvedValue({ status: 'PROCESSING' }),
    getVerificationStatus: vi.fn().mockResolvedValue({ status: 'UNVERIFIED' }),
  });

  it('presignDocument delega al service tras validar rol', async () => {
    const dgi = makeDgi();
    const authz = makeAuthz(Role.COMPANY_ADMIN);
    const controller = new DgiVerificationController(
      dgi as never,
      authz as never,
    );
    const dto = { subjectType: VerificationSubjectType.COMPANY };

    const res = await controller.presignDocument({ sub: 'sub-1' }, dto);

    expect(authz.getUserRole).toHaveBeenCalledWith('sub-1');
    expect(dgi.presignVerificationDocument).toHaveBeenCalledWith('sub-1', dto);
    expect(res.key).toBe('k');
  });

  it('submit delega al service', async () => {
    const dgi = makeDgi();
    const authz = makeAuthz(Role.INDEPENDENT_PRO);
    const controller = new DgiVerificationController(
      dgi as never,
      authz as never,
    );
    const dto = {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      storageKey: 'users/u1/verification/x.pdf',
    };

    await controller.submit({ sub: 'sub-1' }, dto);

    expect(dgi.submitVerification).toHaveBeenCalledWith('sub-1', dto);
  });

  it('status delega al service', async () => {
    const dgi = makeDgi();
    const authz = makeAuthz(Role.INDEPENDENT_PRO);
    const controller = new DgiVerificationController(
      dgi as never,
      authz as never,
    );

    await controller.status(
      { sub: 'sub-1' },
      VerificationSubjectType.PROFESSIONAL,
    );

    expect(dgi.getVerificationStatus).toHaveBeenCalledWith(
      'sub-1',
      VerificationSubjectType.PROFESSIONAL,
    );
  });
});
