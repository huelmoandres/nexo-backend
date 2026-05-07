import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { authConfig } from '@config/auth.config';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Estrategia Passport que valida JWTs firmados por Supabase Auth.
 * Registrada con el nombre `'jwt'` para ser usada por {@link SupabaseAuthGuard}.
 */
@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(authConfig.KEY) config: ConfigType<typeof authConfig>,
    private readonly problemDetailTypes: ProblemDetailTypeService,
  ) {
    if (!config.supabaseJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.supabaseJwtSecret,
    });
  }

  /**
   * Invocado por Passport tras verificar la firma del JWT. Comprueba que `sub` esté presente.
   *
   * @param payload - Claims decodificados del JWT; incluye `sub`, `email`, `exp`, etc.
   * @returns El mismo payload si es válido; lo adjunta a `request.user`.
   */
  validate(payload: AuthenticatedUser): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException({
        type: this.problemDetailTypes.url('auth-invalid-token'),
        title: 'Token inválido',
        status: 401,
        detail: 'El token no contiene el claim sub requerido.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    return payload;
  }
}
