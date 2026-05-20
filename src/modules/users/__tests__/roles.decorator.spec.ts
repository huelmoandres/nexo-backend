import { describe, expect, it } from 'vitest';
import * as authorizationRoles from '@modules/authorization/roles.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';

describe('users/roles.decorator re-export', () => {
  it('re-exporta ROLES_KEY y Roles desde authorization', () => {
    expect(ROLES_KEY).toBe(authorizationRoles.ROLES_KEY);
    expect(Roles).toBe(authorizationRoles.Roles);
  });
});
