import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import Redis from 'ioredis';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { authConfig } from '@config/auth.config';
import { REDIS_AUTH_CLIENT } from '../auth.constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Guard de autenticaci?n que verifica el JWT de Supabase y comprueba la blocklist de Redis.
 * Debe aplicarse antes de cualquier guard de autorizaci?n (roles, permisos).
 */
@Injectable()
export class SupabaseAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Inject(REDIS_AUTH_CLIENT)
    private readonly redisClient: Redis,
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {
    super();
  }

  /**
   * Extrae el Bearer token, comprueba si est? revocado en Redis y delega la validaci?n JWT a Passport.
   *
   * @param context - Contexto HTTP de NestJS; debe tener cabecera `Authorization: Bearer <token>`.
   * @returns `true` si el token es v?lido y no est? revocado.
   */
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.unauthorized('AUTH_TOKEN_MISSING', 'Token no proporcionado');
    }

    const isRevoked = await this.redisClient.get(
      `${this.config.redisBlocklistPrefix}${token}`,
    );
    if (isRevoked) {
      throw this.unauthorized('AUTH_TOKEN_REVOKED', 'Sesi?n cerrada');
    }

    const passportResult = await super.canActivate(context);
    return Boolean(passportResult);
  }

  /**
   * Procesa el resultado de Passport; lanza `UnauthorizedException` si el JWT es inv?lido.
   *
   * @param err - Error de validaci?n emitido por Passport, si existe.
   * @param user - Usuario extra?do del JWT, o `false` si fall? la validaci?n.
   * @returns Usuario autenticado tipado como `TUser`.
   */
  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw this.unauthorized('AUTH_INVALID_TOKEN', 'Token inv?lido');
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

  private unauthorized(code: string, title: string): UnauthorizedException {
    return new UnauthorizedException({
      type: this.problemDetailTypes.fromScreamingCode(code),
      title,
      status: 401,
      detail: title,
      code,
    });
  }
}
