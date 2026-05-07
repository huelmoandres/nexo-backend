import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { appConfig } from '@config/app.config';
import { setupSentry } from '@config/sentry.setup';
import { setupSwagger } from '@config/swagger.setup';
import { DiagnosticsService } from '@modules/diagnostics/diagnostics.service';

async function bootstrap() {
  setupSentry(appConfig().sentryDsn);
  const app = await NestFactory.create(AppModule);
  const problemDetailTypes = app.get(ProblemDetailTypeService);

  // Startup Diagnostics: hace fail-fast si una hard dependency está caída.
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
        return new BadRequestException({
          type: problemDetailTypes.url('validation-error'),
          title: 'Solicitud inválida',
          status: 400,
          detail: 'Error de validación en los datos de entrada.',
          code: 'VALIDATION_ERROR',
          errors: errors.map((error) => ({
            field: error.property,
            constraints: Object.values(error.constraints ?? {}),
          })),
        });
      },
    }),
  );

  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  setupSwagger(app);

  await app.listen(process.env['PORT'] ?? 3000);
}
void bootstrap();
