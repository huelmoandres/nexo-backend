import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildProblem } from '@common/errors/problem.factory';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { appConfig } from '@config/app.config';
import { setupSentry } from '@config/sentry.setup';
import { setupSwagger } from '@config/swagger.setup';
import { DiagnosticsService } from '@modules/diagnostics/diagnostics.service';

async function bootstrap() {
  setupSentry(appConfig().sentryDsn);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? [],
    credentials: true,
  });
  app.useBodyParser('json', { limit: '1mb' });

  await app.get(DiagnosticsService).runStartupChecks();

  app.setGlobalPrefix('api', {
    exclude: ['api/docs', 'api/docs-json', 'health/live', 'health/ready'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new BadRequestException(
          buildProblem(
            'VALIDATION_ERROR',
            'Error de validación en los datos de entrada.',
            {
              errors: errors.map((error) => ({
                field: error.property,
                constraints: Object.values(error.constraints ?? {}),
              })),
            },
          ),
        );
      },
    }),
  );

  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  setupSwagger(app);

  await app.listen(process.env['PORT'] ?? 3000);
}
void bootstrap();
