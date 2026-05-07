import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { appConfig } from '@config/app.config';

type ProblemPayload = Partial<ProblemDetail> & {
  errors?: Array<{ field: string; constraints: string[] }>;
};

const STATUS_TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autorizado',
  403: 'Prohibido',
  404: 'Recurso no encontrado',
  409: 'Conflicto',
  422: 'Entidad no procesable',
  500: 'Error interno del servidor',
};

/**
 * Filtro global de excepciones: convierte cualquier error en una respuesta RFC 7807 (Problem Details).
 * Reporta errores 500+ a Sentry cuando `SENTRY_DSN` está configurado.
 * Registrado como proveedor en `AppModule` para poder recibir inyección de dependencias.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Intercepta cualquier excepción no manejada y la serializa como Problem Detail JSON.
   *
   * @param exception - Excepción capturada; puede ser `HttpException` u otro `Error`.
   * @param host - Contexto de NestJS para acceder a request/response HTTP.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const problem = this.buildProblemDetail(exception, status);

    // Solo reportamos errores 500+ para evitar ruido en Sentry.
    if (status >= 500 && this.config.sentryDsn) {
      Sentry.withScope((scope) => {
        scope.setTag('status_code', String(status));
        scope.setTag('path', request.url);
        scope.setLevel('error');
        scope.setContext('problem_detail', {
          type: problem.type,
          code: problem.code,
          detail: problem.detail,
        });
        Sentry.captureException(
          exception instanceof Error ? exception : new Error(problem.detail),
        );
      });
    }

    response.status(status).json(problem);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return 500;
  }

  private buildProblemDetail(
    exception: unknown,
    status: number,
  ): ProblemPayload {
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'object' && raw !== null) {
        const payload = raw as ProblemPayload & { message?: string | string[] };
        const detail = this.normalizeDetail(
          payload.detail,
          payload.message,
          exception.message,
        );

        return {
          type: payload.type ?? this.typeFromCode(payload.code, status),
          title: payload.title ?? STATUS_TITLES[status] ?? 'Error',
          status,
          detail,
          code: payload.code ?? this.defaultCodeForStatus(status),
          ...(payload.errors ? { errors: payload.errors } : {}),
        };
      }

      return {
        type: this.typeFromCode(undefined, status),
        title: STATUS_TITLES[status] ?? 'Error',
        status,
        detail: typeof raw === 'string' ? raw : exception.message,
        code: this.defaultCodeForStatus(status),
      };
    }

    const detail =
      exception instanceof Error ? exception.message : 'Unexpected error';
    return {
      type: this.problemDetailTypes.url('internal-server-error'),
      title: STATUS_TITLES[500],
      status: 500,
      detail,
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  private normalizeDetail(
    detail?: string,
    message?: string | string[],
    fallback?: string,
  ): string {
    if (detail) return detail;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;
    return fallback ?? 'Unexpected error';
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
    }
  }

  private typeFromCode(code: string | undefined, status: number): string {
    const screaming = code ?? this.defaultCodeForStatus(status);
    return this.problemDetailTypes.fromScreamingCode(screaming);
  }
}
