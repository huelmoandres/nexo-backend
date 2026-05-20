import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Role } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { buildProblem } from '@common/errors/problem.factory';
import { usersConfig } from '@config/users.config';

type CachedRole = { role: Role; expiresAt: number };

@Injectable()
export class AuthorizationService {
  private readonly roleCache = new Map<string, CachedRole>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(usersConfig.KEY)
    private readonly config: ConfigType<typeof usersConfig>,
  ) {}

  /**
   * Invalida caché de rol tras cambios en BD (ej. CLIENT → INDEPENDENT_PRO).
   */
  invalidateRoleCache(supabaseUid: string): void {
    this.roleCache.delete(supabaseUid);
  }

  async assertUserHasAnyRole(
    supabaseUid: string | undefined,
    requiredRoles: Role[],
  ): Promise<void> {
    if (!supabaseUid) {
      throw new ForbiddenException(
        buildProblem(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'No se pudo determinar el usuario autenticado.',
        ),
      );
    }

    const role = await this.resolveRole(supabaseUid);
    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException(
        buildProblem(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'Tu rol no permite realizar esta accion.',
        ),
      );
    }
  }

  private async resolveRole(supabaseUid: string): Promise<Role> {
    const now = Date.now();
    const cached = this.roleCache.get(supabaseUid);
    if (cached && cached.expiresAt > now) {
      return cached.role;
    }

    const user = await this.prisma.user.findFirst({
      where: { supabaseUid, deletedAt: null },
      select: { role: true },
    });
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    this.roleCache.set(supabaseUid, {
      role: user.role,
      expiresAt: now + this.config.roleCacheTtlMs,
    });
    return user.role;
  }
}
