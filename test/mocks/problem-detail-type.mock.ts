import type { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import {
  problemDetailTypeFromScreamingCode,
  problemDetailTypeUrl,
} from '@common/problem-detail/problem-detail-url.util';

export const TEST_PROBLEM_DETAIL_BASE_URL = 'https://nexos.com/errors';

/**
 * Mock de {@link ProblemDetailTypeService} para tests unitarios (misma forma que producción con base por defecto).
 *
 * @param baseUrl - Opcional; por defecto coincide con el default de `app.config`.
 */
export function createProblemDetailTypeMock(
  baseUrl: string = TEST_PROBLEM_DETAIL_BASE_URL,
): ProblemDetailTypeService {
  return {
    getBaseUrl: () => baseUrl,
    url: (slug: string) => problemDetailTypeUrl(baseUrl, slug),
    fromScreamingCode: (code: string) =>
      problemDetailTypeFromScreamingCode(baseUrl, code),
  } as ProblemDetailTypeService;
}
