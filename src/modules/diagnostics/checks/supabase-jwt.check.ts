import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { authConfig } from '@config/auth.config';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

/**
 * Longitud mínima razonable para un JWT secret en HS256.
 * Supabase emite secretos > 30 chars; <16 indica un valor de prueba inservible.
 */
const MIN_JWT_SECRET_LENGTH = 16;

/**
 * Verifica que la configuración de validación de JWTs de Supabase está
 * presente y tiene una longitud razonable. Es una verificación local
 * (no llama a Supabase) — está marcada como `hard` porque sin secreto la
 * estrategia JWT explota en el primer request autenticado.
 */
@Injectable()
export class SupabaseJwtCheck implements DependencyCheck {
  readonly name = 'Supabase JWT';
  readonly kind: DependencyKind = 'hard';

  constructor(
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  endpoint(): string | undefined {
    const url = process.env['SUPABASE_URL'];
    if (url && url.trim() !== '') return url;
    return undefined;
  }

  check(): Promise<DependencyCheckResult> {
    const secret = this.config.supabaseJwtSecret;
    if (!secret) {
      return Promise.resolve({
        status: 'DOWN',
        detail: 'SUPABASE_JWT_SECRET is empty',
      });
    }
    if (secret.length < MIN_JWT_SECRET_LENGTH) {
      return Promise.resolve({
        status: 'DOWN',
        detail: `SUPABASE_JWT_SECRET length=${secret.length} (<${MIN_JWT_SECRET_LENGTH})`,
      });
    }
    return Promise.resolve({
      status: 'UP',
      detail: `JWT secret configured (length=${secret.length})`,
    });
  }
}
