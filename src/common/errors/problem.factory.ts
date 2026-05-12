import { HttpException } from '@nestjs/common';
import { ERRORS } from './error-catalog';
import type { ErrorCode } from './error-codes';

/**
 * Cuerpo de Problem Detail sin `type` explícito: el filtro global lo
 * completa desde `code` (`ProblemDetailTypeService.fromScreamingCode`).
 */
export type ProblemDetailBody = {
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
} & Record<string, unknown>;

/**
 * Construye el objeto `response` de una `HttpException` Nest a partir del
 * catálogo central `ERRORS`.
 */
export function buildProblem(
  code: ErrorCode,
  detail?: string,
  extras?: Record<string, unknown>,
): ProblemDetailBody {
  const entry = ERRORS[code];
  return {
    title: entry.title,
    status: entry.status,
    code,
    ...(detail !== undefined ? { detail } : {}),
    ...(extras ?? {}),
  };
}

/** Atajo para lanzar `HttpException` genérica con cuerpo del catálogo. */
export function problemException(
  code: ErrorCode,
  detail?: string,
  extras?: Record<string, unknown>,
): HttpException {
  const body = buildProblem(code, detail, extras);
  return new HttpException(body, body.status);
}
