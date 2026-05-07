import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Marca un handler de controller para exigir uno de los roles indicados.
 * Requiere {@link RolesGuard} después del guard de autenticación.
 *
 * @param roles - Roles de Prisma permitidos para la ruta.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
