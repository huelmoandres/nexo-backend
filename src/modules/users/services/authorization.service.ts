import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Role } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { usersConfig } from '@config/users.config';

type CachedRole = { role: Role; expiresAt: number };

@Injectable()
export class AuthorizationService {
  private readonly roleCache = new Map<string, CachedRole>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(usersConfig.KEY)
    private readonly config: ConfigType<typeof usersConfig>,
  ) {}

  async assertUserHasAnyRole(
    supabaseUid: string | undefined,
    requiredRoles: Role[],
  ): Promise<void> {
    if (!supabaseUid) {
      throw new ForbiddenException({
        type: this.problemDetailTypes.url('auth-insufficient-permissions'),
        title: 'Permisos insuficientes',
        status: 403,
        detail: 'No se pudo determinar el usuario autenticado.',
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
      });
    }

    const role = await this.resolveRole(supabaseUid);
    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException({
        type: this.problemDetailTypes.url('auth-insufficient-permissions'),
        title: 'Permisos insuficientes',
        status: 403,
        detail: 'Tu rol no permite realizar esta accion.',
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
      });
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
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: 'USER_NOT_FOUND',
      });
    }

    this.roleCache.set(supabaseUid, {
      role: user.role,
      expiresAt: now + this.config.roleCacheTtlMs,
    });
    return user.role;
  }
}
