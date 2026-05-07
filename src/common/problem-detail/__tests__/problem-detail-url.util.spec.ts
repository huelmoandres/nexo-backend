import { describe, expect, it } from 'vitest';
import {
  problemDetailTypeFromScreamingCode,
  problemDetailTypeUrl,
} from '../problem-detail-url.util';

describe('problem-detail-url.util', () => {
  it('problemDetailTypeUrl quita barras duplicadas', () => {
    expect(
      problemDetailTypeUrl('https://nexos.com/errors/', '/validation-error'),
    ).toBe('https://nexos.com/errors/validation-error');
  });

  it('problemDetailTypeFromScreamingCode convierte código a kebab', () => {
    expect(
      problemDetailTypeFromScreamingCode(
        'https://api.example/errors',
        'AUTH_TOKEN_MISSING',
      ),
    ).toBe('https://api.example/errors/auth-token-missing');
  });
});
