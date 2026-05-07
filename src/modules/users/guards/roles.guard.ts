import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { AuthorizationService } from '../services/authorization.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Comprueba que el usuario autenticado tenga uno de los roles declarados con {@link Roles}.
 * Resuelve el rol en base de datos (no confía solo en el JWT).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /**
   * @param context - Contexto HTTP de Nest; debe incluir `user.sub` (Supabase UID).
   * @returns `true` si no hay restricción de roles o el rol en DB coincide.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    await this.authorizationService.assertUserHasAnyRole(
      request.user?.sub,
      requiredRoles,
    );
    return true;
  }
}
