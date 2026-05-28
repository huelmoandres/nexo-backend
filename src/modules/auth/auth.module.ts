import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import Redis from 'ioredis';
import { PrismaModule } from '@prisma/prisma.module';
import { authConfig } from '@config/auth.config';
import { REDIS_AUTH_CLIENT } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseJwtStrategy,
    SupabaseAuthGuard,
    {
      provide: REDIS_AUTH_CLIENT,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): Redis => {
        const redis = new Redis(config.redisUrl, {
          maxRetriesPerRequest: config.redisMaxRetriesPerRequest,
          enableReadyCheck: false,
          retryStrategy: (attempt) =>
            attempt > 5 ? null : Math.min(attempt * 250, 2000),
        });
        redis.on('error', () => undefined);
        return redis;
      },
    },
  ],
  exports: [AuthService, SupabaseAuthGuard, REDIS_AUTH_CLIENT],
})
export class AuthModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_AUTH_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
