import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { buildProblem } from '@common/errors/problem.factory';
import { authConfig } from '@config/auth.config';
import { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { createSupabaseJwtSecretProvider } from '@modules/auth/strategies/supabase-jwt.strategy';

@Injectable()
export class WsJwtService {
  private readonly secretProvider: ReturnType<
    typeof createSupabaseJwtSecretProvider
  >;

  constructor(
    @Inject(authConfig.KEY)
    private readonly cfg: ConfigType<typeof authConfig>,
  ) {
    this.secretProvider = createSupabaseJwtSecretProvider(cfg);
  }

  async validateToken(token: string | undefined): Promise<AuthenticatedUser> {
    if (!token) {
      throw new UnauthorizedException(
        buildProblem(
          'AUTH_INVALID_TOKEN',
          'Token requerido para conexión realtime.',
        ),
      );
    }

    const secret = await this.resolveSecret(token);
    const verified = jwt.verify(token, secret, {
      algorithms: ['HS256', 'RS256', 'ES256'],
      clockTolerance: 120,
    });

    if (
      typeof verified !== 'object' ||
      verified === null ||
      typeof verified.sub !== 'string'
    ) {
      throw new UnauthorizedException(
        buildProblem(
          'AUTH_INVALID_TOKEN',
          'El token no contiene el claim sub requerido.',
        ),
      );
    }

    return verified as AuthenticatedUser;
  }

  private async resolveSecret(rawJwtToken: string): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
      this.secretProvider({}, rawJwtToken, (err, secretOrKey) => {
        if (err || !secretOrKey) {
          reject(
            new UnauthorizedException(
              buildProblem('AUTH_INVALID_TOKEN', 'Token realtime inválido.'),
            ),
          );
          return;
        }
        resolve(secretOrKey);
      });
    });
  }
}
