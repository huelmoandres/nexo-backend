import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Type } from '@nestjs/common';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';

export async function createE2eApp(
  rootModule: Type<unknown>,
): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, { logger: false });
  app.setGlobalPrefix('api', {
    exclude: ['api/docs', 'api/docs-json', 'health/live', 'health/ready'],
  });
  const problemDetailTypes = app.get(ProblemDetailTypeService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          type: problemDetailTypes.url('validation-error'),
          title: 'Solicitud invalida',
          status: 400,
          detail: 'Error de validacion en los datos de entrada.',
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
