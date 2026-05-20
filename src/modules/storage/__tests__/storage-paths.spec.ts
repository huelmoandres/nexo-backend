import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  KYC_KEY_PATTERN,
  PORTFOLIO_PHOTO_KEY_PATTERN,
  VERIFICATION_DOC_KEY_PATTERN,
  USER_ROOT_PREFIX,
  assertKeyBelongsToUser,
  buildKycKey,
  buildPortfolioPhotoKey,
  buildVerificationDocKey,
  parseUserIdFromKey,
  portfolioItemScope,
  userScope,
} from '../storage-paths';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('storage-paths', () => {
  describe('USER_ROOT_PREFIX', () => {
    it('es la cadena canónica "users"', () => {
      expect(USER_ROOT_PREFIX).toBe('users');
    });
  });

  describe('userScope', () => {
    it('devuelve "users/<userId>/" para userId válido', () => {
      expect(userScope('abc123')).toBe('users/abc123/');
    });

    it('acepta IDs con guiones medios y bajos', () => {
      expect(userScope('user-foo_bar-42')).toBe('users/user-foo_bar-42/');
    });

    it('lanza Error si userId está vacío', () => {
      expect(() => userScope('')).toThrow(/invalid userId/);
    });

    it('lanza Error si userId tiene caracteres prohibidos (slash)', () => {
      expect(() => userScope('a/b')).toThrow(/invalid userId/);
    });

    it('lanza Error si userId tiene caracteres prohibidos (espacio)', () => {
      expect(() => userScope('a b')).toThrow(/invalid userId/);
    });
  });

  describe('portfolioItemScope', () => {
    it('devuelve el prefijo correcto para el item', () => {
      expect(portfolioItemScope('user1', 'item-42')).toBe(
        'users/user1/portfolio/item-42/',
      );
    });

    it('lanza Error si itemId está vacío', () => {
      expect(() => portfolioItemScope('user1', '')).toThrow(/invalid itemId/);
    });

    it('lanza Error si itemId tiene caracteres prohibidos', () => {
      expect(() => portfolioItemScope('user1', 'item/oops')).toThrow(
        /invalid itemId/,
      );
    });

    it('valida primero el userId antes que el itemId', () => {
      expect(() => portfolioItemScope('', 'item')).toThrow(/invalid userId/);
    });
  });

  describe('buildKycKey', () => {
    it('construye una key válida que matchea KYC_KEY_PATTERN', () => {
      const key = buildKycKey('user1', 'IDENTITY_CARD', 'jpg');

      expect(key).toMatch(KYC_KEY_PATTERN);
      expect(key.startsWith('users/user1/kyc/IDENTITY_CARD-')).toBe(true);
      expect(key.endsWith('.jpg')).toBe(true);
      expect(key).toMatch(UUID_RE);
    });

    it('normaliza la extensión a minúsculas', () => {
      const key = buildKycKey('user1', 'SELFIE', 'JPG');
      expect(key.endsWith('.jpg')).toBe(true);
    });

    it('acepta el punto inicial en la extensión y lo remueve', () => {
      const key = buildKycKey('user1', 'SELFIE', '.png');
      expect(key.endsWith('.png')).toBe(true);
    });

    it('lanza si kind no es SCREAMING_SNAKE_CASE', () => {
      expect(() => buildKycKey('user1', 'identity_card', 'jpg')).toThrow(
        /invalid kind/,
      );
    });

    it('lanza si la extensión no está en el set permitido', () => {
      expect(() => buildKycKey('user1', 'SELFIE', 'webp')).toThrow(
        /extension "webp" not in allowed set/,
      );
    });

    it('lanza si el userId es inválido', () => {
      expect(() => buildKycKey('', 'SELFIE', 'jpg')).toThrow(/invalid userId/);
    });

    it('produce keys únicas en llamadas consecutivas (UUID v4)', () => {
      const a = buildKycKey('user1', 'SELFIE', 'jpg');
      const b = buildKycKey('user1', 'SELFIE', 'jpg');
      expect(a).not.toBe(b);
    });
  });

  describe('buildVerificationDocKey', () => {
    it('construye key PDF bajo verification/', () => {
      const key = buildVerificationDocKey('user1', 'pdf');
      expect(key).toMatch(VERIFICATION_DOC_KEY_PATTERN);
      expect(key.startsWith('users/user1/verification/')).toBe(true);
      expect(key.endsWith('.pdf')).toBe(true);
    });

    it('rechaza extensiones distintas de pdf', () => {
      expect(() => buildVerificationDocKey('user1', 'jpg')).toThrow(
        /not in allowed set/,
      );
    });
  });

  describe('buildPortfolioPhotoKey', () => {
    it('construye una key válida que matchea PORTFOLIO_PHOTO_KEY_PATTERN', () => {
      const key = buildPortfolioPhotoKey('user1', 'item-1', 'webp');

      expect(key).toMatch(PORTFOLIO_PHOTO_KEY_PATTERN);
      expect(key.startsWith('users/user1/portfolio/item-1/')).toBe(true);
      expect(key.endsWith('.webp')).toBe(true);
    });

    it('acepta jpg, jpeg, png y webp', () => {
      for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        const key = buildPortfolioPhotoKey('user1', 'item-1', ext);
        expect(key).toMatch(PORTFOLIO_PHOTO_KEY_PATTERN);
      }
    });

    it('rechaza extensiones no permitidas', () => {
      expect(() => buildPortfolioPhotoKey('user1', 'item-1', 'pdf')).toThrow(
        /not in allowed set/,
      );
    });

    it('valida itemId', () => {
      expect(() => buildPortfolioPhotoKey('user1', '', 'jpg')).toThrow(
        /invalid itemId/,
      );
    });
  });

  describe('parseUserIdFromKey', () => {
    it('extrae el userId de una key bien formada', () => {
      expect(parseUserIdFromKey('users/abc123/kyc/SELFIE-x.jpg')).toBe(
        'abc123',
      );
    });

    it('extrae el userId de una key de portfolio', () => {
      expect(parseUserIdFromKey('users/user-1/portfolio/item-1/file.jpg')).toBe(
        'user-1',
      );
    });

    it('devuelve null para keys sin prefijo "users/"', () => {
      expect(parseUserIdFromKey('kyc/something.jpg')).toBeNull();
    });

    it('devuelve null para keys con prefijo distinto', () => {
      expect(parseUserIdFromKey('usr_abc/portfolio/x.jpg')).toBeNull();
    });

    it('devuelve null para una key vacía', () => {
      expect(parseUserIdFromKey('')).toBeNull();
    });
  });

  describe('assertKeyBelongsToUser', () => {
    it('no lanza cuando el key pertenece al usuario', () => {
      expect(() =>
        assertKeyBelongsToUser('users/u1/kyc/SELFIE-x.jpg', 'u1'),
      ).not.toThrow();
    });

    it('lanza ForbiddenException cuando el key pertenece a otro usuario', () => {
      expect(() =>
        assertKeyBelongsToUser('users/OTRO/kyc/SELFIE-x.jpg', 'u1'),
      ).toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException cuando el key no empieza con users/', () => {
      expect(() => assertKeyBelongsToUser('kyc/SELFIE-x.jpg', 'u1')).toThrow(
        ForbiddenException,
      );
    });

    it('la ForbiddenException incluye code STORAGE_FORBIDDEN_KEY', () => {
      try {
        assertKeyBelongsToUser('users/OTRO/x.jpg', 'u1');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('STORAGE_FORBIDDEN_KEY');
      }
    });
  });

  describe('KYC_KEY_PATTERN', () => {
    it('matchea ejemplos canónicos', () => {
      expect(
        KYC_KEY_PATTERN.test(
          'users/abc/kyc/IDENTITY_CARD-550e8400-e29b-41d4-a716-446655440000.jpg',
        ),
      ).toBe(true);
      expect(
        KYC_KEY_PATTERN.test(
          'users/u1/kyc/SELFIE-550e8400-e29b-41d4-a716-446655440000.pdf',
        ),
      ).toBe(true);
    });

    it('rechaza ejemplos inválidos', () => {
      expect(KYC_KEY_PATTERN.test('users/u1/kyc/SELFIE-not-a-uuid.jpg')).toBe(
        false,
      );
      expect(KYC_KEY_PATTERN.test('usr_u1/kyc/x.jpg')).toBe(false);
      expect(
        KYC_KEY_PATTERN.test(
          'users/u1/portfolio/i/550e8400-e29b-41d4-a716-446655440000.jpg',
        ),
      ).toBe(false);
    });
  });

  describe('PORTFOLIO_PHOTO_KEY_PATTERN', () => {
    it('matchea ejemplos canónicos', () => {
      expect(
        PORTFOLIO_PHOTO_KEY_PATTERN.test(
          'users/u1/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp',
        ),
      ).toBe(true);
    });

    it('rechaza ejemplos inválidos', () => {
      expect(
        PORTFOLIO_PHOTO_KEY_PATTERN.test('users/u1/portfolio/item-1/foo.pdf'),
      ).toBe(false);
      expect(
        PORTFOLIO_PHOTO_KEY_PATTERN.test('users/u1/kyc/SELFIE-x.jpg'),
      ).toBe(false);
    });
  });
});
