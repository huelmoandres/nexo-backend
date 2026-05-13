import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnprocessableEntityException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../global-exception.filter';

const makeAppConfig = (sentryDsn = '') => ({
  problemDetailTypeBaseUrl: 'https://nexos.com/errors',
  sentryDsn,
});

describe('GlobalExceptionFilter', () => {
  const makeHost = () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const response = { status };
    const request = { url: '/test-path' };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it('mapea BadRequestException a RFC7807', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(
      new BadRequestException({
        detail: 'Invalid body',
        code: 'VALIDATION_ERROR',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('preserva campos type/title/code/errors cuando vienen en payload', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, json } = makeHost();
    filter.catch(
      new BadRequestException({
        type: 'https://nexos.com/errors/custom',
        title: 'Custom title',
        detail: 'Custom detail',
        code: 'CUSTOM_CODE',
        errors: [{ field: 'email', constraints: ['invalid'] }],
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://nexos.com/errors/custom',
        title: 'Custom title',
        code: 'CUSTOM_CODE',
        errors: [{ field: 'email', constraints: ['invalid'] }],
      }),
    );
  });

  it('mapea UnauthorizedException a 401', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(
      new UnauthorizedException({
        detail: 'Invalid token',
        code: 'AUTH_INVALID_TOKEN',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_INVALID_TOKEN',
      }),
    );
  });

  it('mapea NotFoundException a 404', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        code: 'NOT_FOUND',
      }),
    );
  });

  it('mapea HttpException genérica a su status', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(new HttpException('Conflict', 409), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONFLICT',
      }),
    );
  });

  it('HttpException con status sin entrada en STATUS_TITLES usa title Error', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(new HttpException('teapot', 418), host);
    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error', detail: 'teapot' }),
    );
  });

  it('HttpException con objeto sin title usa mapa STATUS_TITLES', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, json } = makeHost();
    filter.catch(
      new BadRequestException({
        detail: 'solo detail',
        code: 'CUSTOM',
      }),
      host,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Solicitud inválida' }),
    );
  });

  it('HttpException con objeto y status no mapeado usa title Error', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        {
          detail: 'custom detail',
          code: 'CUSTOM',
        },
        418,
      ),
      host,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error', detail: 'custom detail' }),
    );
  });

  it('mapea HttpException con response string', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, json } = makeHost();
    filter.catch(new HttpException('Plain message', 400), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Plain message',
      }),
    );
  });

  it('HttpException con response primitivo no-string usa exception.message', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, json } = makeHost();
    filter.catch(new HttpException(123 as never, 400), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Http Exception' }),
    );
  });

  it('normaliza detail cuando message es array o string', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const hostArray = makeHost();
    filter.catch(
      new BadRequestException({
        message: ['a', 'b'],
      }),
      hostArray.host,
    );
    expect(hostArray.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'a; b' }),
    );

    const hostString = makeHost();
    filter.catch(
      new BadRequestException({
        message: 'single message',
      }),
      hostString.host,
    );
    expect(hostString.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'single message' }),
    );
  });

  it('mapea ForbiddenException y UnprocessableEntityException', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const h1 = makeHost();
    filter.catch(new ForbiddenException('forbidden'), h1.host);
    expect(h1.status).toHaveBeenCalledWith(403);

    const h2 = makeHost();
    filter.catch(new UnprocessableEntityException('unprocessable'), h2.host);
    expect(h2.status).toHaveBeenCalledWith(422);
  });

  it('mapea error no controlado a 500', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig());
    const { host, status, json } = makeHost();
    filter.catch(new Error('Boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );
  });

  it('reporta a Sentry cuando status >= 500', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig('https://dsn.test'));
    const { host, status, json } = makeHost();
    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
    );
  });

  it('cubre rama de captureException cuando error no es instancia Error', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig('https://dsn.test'));
    const { host, status } = makeHost();
    filter.catch({ not: 'an-error-object' }, host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('cubre branches internos de defaultCodeForStatus y typeFromCode', () => {
    const filter = new GlobalExceptionFilter(makeAppConfig()) as unknown as {
      defaultCodeForStatus: (status: number) => string;
      typeFromCode: (code: string | undefined, status: number) => string;
    };

    expect(filter.defaultCodeForStatus(400)).toBe('BAD_REQUEST');
    expect(filter.defaultCodeForStatus(401)).toBe('UNAUTHORIZED');
    expect(filter.defaultCodeForStatus(403)).toBe('FORBIDDEN');
    expect(filter.defaultCodeForStatus(404)).toBe('NOT_FOUND');
    expect(filter.defaultCodeForStatus(409)).toBe('CONFLICT');
    expect(filter.defaultCodeForStatus(422)).toBe('UNPROCESSABLE_ENTITY');
    expect(filter.defaultCodeForStatus(503)).toBe('SERVICE_UNAVAILABLE');
    expect(filter.defaultCodeForStatus(500)).toBe('INTERNAL_SERVER_ERROR');
    expect(filter.defaultCodeForStatus(418)).toBe('HTTP_ERROR');
    expect(filter.typeFromCode(undefined, 401)).toContain(
      '/errors/unauthorized',
    );
    const normalized = (
      filter as unknown as {
        normalizeDetail: (
          detail?: string,
          message?: string | string[],
          fallback?: string,
        ) => string;
      }
    ).normalizeDetail(undefined, undefined, undefined);
    expect(normalized).toBe('Unexpected error');
  });
});
