import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { buildProblem } from '@common/errors/problem.factory';
import { authConfig } from '@config/auth.config';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { getJwksClient, resolveSupabaseJwksUri } from '../supabase-jwks.util';

/**
 * Factory de Passport: valida y entrega secreto simétrico o clave pública JWKS.
 * Exportada para tests unitarios del flujo HS256 / ES256 sin levantar HTTP.
 */
export function createSupabaseJwtSecretProvider(
  cfg: ConfigType<typeof authConfig>,
): (
  _request: unknown,
  rawJwtToken: string,
  done: (err: Error | null, secretOrKey?: string | Buffer) => void,
) => void {
  return (
    _request: unknown,
    rawJwtToken: string,
    done: (err: Error | null, secretOrKey?: string | Buffer) => void,
  ) => {
    try {
      const decoded = jwt.decode(rawJwtToken, { complete: true });
      if (!decoded || typeof decoded === 'string' || !decoded.header) {
        return done(new Error('JWT mal formado'), undefined);
      }

      const { alg, kid } = decoded.header;

      if (alg === 'HS256') {
        return done(null, cfg.supabaseJwtSecret);
      }

      if (alg !== 'RS256' && alg !== 'ES256') {
        return done(
          new Error(`Algoritmo JWT no admitido: ${String(alg)}`),
          undefined,
        );
      }

      if (!kid) {
        return done(new Error('JWT asimétrico sin header kid'), undefined);
      }

      const jwksUri = resolveSupabaseJwksUri(cfg.supabaseUrl, decoded.payload);
      if (!jwksUri) {
        return done(
          new Error(
            'JWKS Supabase no resuelto: define SUPABASE_URL o usa tokens con claim iss válido.',
          ),
          undefined,
        );
      }

      const jwks = getJwksClient(jwksUri);
      jwks.getSigningKey(kid, (jwksErr, key) => {
        if (jwksErr !== null || !key) {
          return done(
            jwksErr ?? new Error('JWKS signing key unavailable'),
            undefined,
          );
        }
        return done(null, key.getPublicKey());
      });

      return;
    } catch (e: unknown) {
      return done(
        e instanceof Error ? e : new Error('JWT decode failure'),
        undefined,
      );
    }
  };
}

/**
 * Estrategia Passport que valida JWTs firmados por Supabase Auth.
 *
 * - **HS256** (p. ej. tests con `jwt.sign`): clave simétrica `SUPABASE_JWT_SECRET`.
 * - **RS256 / ES256** (proyectos Supabase corrientes): clave desde JWKS
 *   (`SUPABASE_URL` …/jwks.json o claim `iss` del payload).
 *
 * Registrada con el nombre `'jwt'` para ser usada por {@link SupabaseAuthGuard}.
 */
@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(authConfig.KEY) readonly config: ConfigType<typeof authConfig>,
  ) {
    if (!config.supabaseJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256', 'RS256', 'ES256'],
      jsonWebTokenOptions: {
        clockTolerance: 120,
      },
      secretOrKeyProvider: createSupabaseJwtSecretProvider(config),
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
      throw new UnauthorizedException(
        buildProblem(
          'AUTH_INVALID_TOKEN',
          'El token no contiene el claim sub requerido.',
        ),
      );
    }

    return payload;
  }
}
