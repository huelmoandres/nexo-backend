import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { ProblemDetailModule } from '@common/problem-detail/problem-detail.module';
import { AppLoggerModule } from '@common/logger/logger.module';
import { appConfig } from '@config/app.config';
import { authConfig } from '@config/auth.config';
import { categoriesConfig } from '@config/categories.config';
import { diagnosticsConfig } from '@config/diagnostics.config';
import { searchConfig } from '@config/search.config';
import { storageConfig } from '@config/storage.config';
import { usersConfig } from '@config/users.config';
import { validateEnv } from '@config/env.validation';
import { AuthModule } from '@modules/auth/auth.module';
import { CategoriesModule } from '@modules/categories/categories.module';
import { DiagnosticsModule } from '@modules/diagnostics/diagnostics.module';
import { SearchModule } from '@modules/search/search.module';
import { HealthModule } from '@modules/health/health.module';
import { StorageModule } from '@modules/storage/storage.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        authConfig,
        appConfig,
        categoriesConfig,
        diagnosticsConfig,
        searchConfig,
        storageConfig,
        usersConfig,
      ],
      validate: validateEnv,
    }),
    ProblemDetailModule,
    AppLoggerModule,
    DiagnosticsModule,
    HealthModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    SearchModule,
  ],
  providers: [GlobalExceptionFilter],
})
export class AppModule {}
