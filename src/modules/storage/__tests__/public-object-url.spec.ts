import { describe, expect, it } from 'vitest';
import { buildPublicObjectUrl } from '../public-object-url';

describe('buildPublicObjectUrl', () => {
  it('retorna null si baseUrl no está configurada', () => {
    expect(buildPublicObjectUrl('a/b.png', undefined)).toBeNull();
    expect(buildPublicObjectUrl('a/b.png', '   ')).toBeNull();
  });

  it('normaliza slash final de base y slash inicial de key', () => {
    expect(
      buildPublicObjectUrl('/folder/photo.jpg', 'https://pub.example.r2.dev/'),
    ).toBe('https://pub.example.r2.dev/folder/photo.jpg');
  });
});
