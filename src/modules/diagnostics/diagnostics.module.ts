import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@modules/auth/auth.module';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@modules/storage/storage.module';
import { PostgresCheck } from './checks/postgres.check';
import { RedisCheck } from './checks/redis.check';
import { SentryCheck } from './checks/sentry.check';
import { StorageCheck } from './checks/storage.check';
import { SupabaseJwtCheck } from './checks/supabase-jwt.check';
import { DiagnosticsService } from './diagnostics.service';
import {
  DEPENDENCY_CHECKS,
  type DependencyCheck,
} from './interfaces/dependency-check.interface';

/**
 * Módulo de Startup Diagnostics. Reúne todos los `DependencyCheck` activos
 * (PostgreSQL, Redis, Supabase JWT, Sentry, R2 Storage) y los provee al
 * {@link DiagnosticsService} mediante el token {@link DEPENDENCY_CHECKS}.
 *
 * El módulo no incluye Mongo ni MySQL: ninguno está en el stack activo.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, StorageModule],
  providers: [
    PostgresCheck,
    RedisCheck,
    SupabaseJwtCheck,
    SentryCheck,
    StorageCheck,
    {
      provide: DEPENDENCY_CHECKS,
      useFactory: (
        postgres: PostgresCheck,
        redis: RedisCheck,
        supabase: SupabaseJwtCheck,
        sentry: SentryCheck,
        storage: StorageCheck,
      ): DependencyCheck[] => [postgres, redis, supabase, sentry, storage],
      inject: [
        PostgresCheck,
        RedisCheck,
        SupabaseJwtCheck,
        SentryCheck,
        StorageCheck,
      ],
    },
    DiagnosticsService,
  ],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
