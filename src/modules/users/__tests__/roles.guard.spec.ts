import { describe, expect, it } from 'vitest';
import { RolesGuard as UsersRolesGuard } from '../guards/roles.guard';
import { RolesGuard as CanonicalRolesGuard } from '@modules/authorization/roles.guard';

describe('users/roles.guard re-export', () => {
  it('re-exporta RolesGuard desde modules/authorization', () => {
    expect(UsersRolesGuard).toBe(CanonicalRolesGuard);
  });
});
