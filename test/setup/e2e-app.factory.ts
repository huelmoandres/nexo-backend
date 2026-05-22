import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { problemDetailTypeUrl } from '@common/problem-detail/problem-detail-url.util';
import { appConfig } from '@config/app.config';

export async function createE2eApp(
  rootModule: Type<unknown>,
): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  app.setGlobalPrefix('api', {
    exclude: ['api/docs', 'api/docs-json', 'health/live', 'health/ready'],
  });
  const cfg = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          type: problemDetailTypeUrl(
            cfg.problemDetailTypeBaseUrl,
            'validation-error',
          ),
          title: 'Solicitud inválida',
          status: 400,
          detail: 'Error de validación en los datos de entrada.',
          code: 'VALIDATION_ERROR',
          errors: errors.map((error) => ({
            field: error.property,
            constraints: Object.values(error.constraints ?? {}),
          })),
        }),
    }),
  );
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  await app.init();
  return app;
}
