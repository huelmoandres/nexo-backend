import { describe, expect, it } from 'vitest';
import { AuthorizationService as UsersAuthorizationService } from '../services/authorization.service';
import { AuthorizationService as CanonicalAuthorizationService } from '@modules/authorization/authorization.service';

describe('users/authorization.service re-export', () => {
  it('re-exporta AuthorizationService desde modules/authorization', () => {
    expect(UsersAuthorizationService).toBe(CanonicalAuthorizationService);
  });
});
