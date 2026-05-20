import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AuditAction, Role, User } from '@prisma/client';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import * as jwt from 'jsonwebtoken';
import { buildProblem } from '@common/errors/problem.factory';
import { PrismaService } from '@prisma/prisma.service';
import { authConfig } from '@config/auth.config';
import { REDIS_AUTH_CLIENT } from './auth.constants';
import { SyncUserDto } from './dto/sync-user.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_AUTH_CLIENT)
    private readonly redisClient: Redis,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /**
   * Genera un JWT de desarrollo firmado con SUPABASE_JWT_SECRET.
   * Solo disponible cuando NODE_ENV !== 'production'.
   */
  generateDevToken(email: string, uid: string): { token: string } {
    if (process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }

    const secret = this.config.supabaseJwtSecret;
    const token = jwt.sign(
      {
        sub: uid,
        email,
        role: 'authenticated',
        aud: 'authenticated',
      },
      secret,
      { expiresIn: '1h' },
    );

    return { token };
  }

  /**
   * Sincroniza un usuario de Supabase con la base de datos local (JIT).
   * Si el usuario ya existe lo retorna; si no, lo crea junto al `AuditLog`.
   *
   * @param payload - Claims del JWT verificado (debe incluir `sub`).
   * @param dto - Email y nombre completo del usuario.
   * @param meta - IP y user-agent para el registro de auditoría.
   * @returns Objeto con el usuario persistido y flag `created` que indica si fue creado en esta llamada.
   */
  async syncUser(
    payload: AuthenticatedUser,
    dto: SyncUserDto,
    meta: RequestMeta,
  ): Promise<{ user: User; created: boolean }> {
    const supabaseUid = payload.sub;
    if (!supabaseUid) {
      throw new UnauthorizedException(
        buildProblem(
          'AUTH_INVALID_TOKEN',
          'No se encontró el identificador del usuario en el JWT.',
        ),
      );
    }

    if (
      payload.email &&
      dto.email.toLowerCase() !== payload.email.toLowerCase()
    ) {
      throw new ConflictException(
        buildProblem(
          'CONFLICT',
          'El email proporcionado no coincide con el email del token JWT.',
        ),
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { supabaseUid },
    });

    if (existingUser) {
      return { user: existingUser, created: false };
    }

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          supabaseUid,
          email: dto.email.toLowerCase(),
          fullName: dto.fullName,
          role: Role.CLIENT,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: AuditAction.USER_CREATED,
          entityType: 'User',
          entityId: newUser.id,
          metadata: {
            source: 'auth.sync',
            createdBy: 'just-in-time',
            supabaseUid,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });

      return newUser;
    });

    this.logger.log(`Usuario sincronizado por primera vez: ${createdUser.id}`);
    return { user: createdUser, created: true };
  }

  /**
   * Invalida el token JWT agregándolo a la blocklist de Redis con TTL hasta su expiración.
   *
   * @param rawToken - Token en formato Bearer (sin prefijo); se usa como clave en Redis.
   * @param payload - Claims del JWT; se usa `exp` para calcular el TTL.
   */
  async logout(rawToken: string, payload: AuthenticatedUser): Promise<void> {
    const exp = payload.exp;
    if (!exp) {
      throw new UnauthorizedException(
        buildProblem('AUTH_INVALID_TOKEN', 'El token no contiene expiración.'),
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;
    const ttlSeconds = ttl > 0 ? ttl : 1;

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    try {
      await this.redisClient.set(
        `${this.config.redisBlocklistPrefix}${tokenHash}`,
        '1',
        'EX',
        ttlSeconds,
      );
    } catch (error) {
      this.logger.error('No se pudo persistir token en blocklist Redis', error);
      throw new InternalServerErrorException(
        buildProblem(
          'INTERNAL_SERVER_ERROR',
          'No se pudo invalidar el token en Redis.',
        ),
      );
    }
  }
}
