import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY, Roles } from '../roles.decorator';

describe('Roles decorator', () => {
  it('expone ROLES_KEY', () => {
    expect(ROLES_KEY).toBe('roles');
  });

  it('devuelve un decorador con los roles indicados', () => {
    expect(typeof Roles).toBe('function');
    const decorator = Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN);
    expect(typeof decorator).toBe('function');
  });
});
