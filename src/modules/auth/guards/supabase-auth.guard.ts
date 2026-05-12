import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import Redis from 'ioredis';
import { buildProblem } from '@common/errors/problem.factory';
import { authConfig } from '@config/auth.config';
import { REDIS_AUTH_CLIENT } from '../auth.constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Mensaje de error JWT que Passport suele pasar en `info` cuando `user` es false y `err` es null.
 */
function readJwtFailureDetail(err: unknown, info: unknown): string | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    const m = (err as { message: string }).message.trim();
    if (m.length > 0) {
      return m;
    }
  }
  if (
    typeof info === 'object' &&
    info !== null &&
    'message' in info &&
    typeof (info as { message?: unknown }).message === 'string'
  ) {
    const m = (info as { message: string }).message.trim();
    if (m.length > 0) {
      return m;
    }
  }
  if (typeof info === 'string' && info.trim().length > 0) {
    return info.trim();
  }
  return null;
}

/**
 * Guard de autenticacion que verifica el JWT de Supabase y la blocklist de Redis.
 * Debe aplicarse antes de guards de autorizacion (roles, permisos).
 */
@Injectable()
export class SupabaseAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Inject(REDIS_AUTH_CLIENT)
    private readonly redisClient: Redis,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {
    super();
  }

  /**
   * Extrae el Bearer token, comprueba revocacion en Redis y delega la validacion JWT a Passport.
   */
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.unauthorized(
        'AUTH_TOKEN_MISSING',
        'Se requiere el header Authorization: Bearer <token>.',
      );
    }

    const isRevoked = await this.redisClient.get(
      `${this.config.redisBlocklistPrefix}${token}`,
    );
    if (isRevoked) {
      throw this.unauthorized(
        'AUTH_TOKEN_REVOKED',
        'Este token fue invalidado al cerrar sesión.',
      );
    }

    const passportResult = await super.canActivate(context);
    return Boolean(passportResult);
  }

  /**
   * Passport invoca `(err, user, info)`. En fallos JWT a menudo llega `info.message` con el motivo real
   * aunque `err` sea null.
   *
   * @see https://github.com/nestjs/passport/blob/master/lib/auth.guard.ts
   */
  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    void context;
    void status;
    if (err || !user) {
      const showCause = process.env['NODE_ENV'] !== 'production';
      const cause = readJwtFailureDetail(err, info);
      const detail =
        showCause && cause !== null
          ? `Token invalido (${cause}).`
          : 'Token invalido';
      throw this.unauthorized('AUTH_INVALID_TOKEN', detail);
    }

    return user;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  private unauthorized(
    code: 'AUTH_TOKEN_MISSING' | 'AUTH_TOKEN_REVOKED' | 'AUTH_INVALID_TOKEN',
    detail: string,
  ): UnauthorizedException {
    return new UnauthorizedException(buildProblem(code, detail));
  }
}
