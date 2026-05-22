import { describe, expect, it } from 'vitest';
import { ProblemDetailTypeService } from '../problem-detail-type.service';

describe('ProblemDetailTypeService', () => {
  it('usa problemDetailTypeBaseUrl del objeto de config inyectado', () => {
    const config = {
      problemDetailTypeBaseUrl: 'https://docs.nexos.dev/problems',
      sentryDsn: '',
      appTimezone: 'America/Montevideo',
    };
    const svc = new ProblemDetailTypeService(config);
    expect(svc.getBaseUrl()).toBe('https://docs.nexos.dev/problems');
    expect(svc.url('not-found')).toBe(
      'https://docs.nexos.dev/problems/not-found',
    );
    expect(svc.fromScreamingCode('USER_NOT_FOUND')).toBe(
      'https://docs.nexos.dev/problems/user-not-found',
    );
  });
});
