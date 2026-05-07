import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CurrentUser } from '../decorators/current-user.decorator';

describe('CurrentUser decorator', () => {
  class TestController {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    testMethod(@CurrentUser() _user: unknown): void {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    testMethodWithKey(@CurrentUser('sub') _sub: unknown): void {}
  }

  it('retorna user completo cuando no se pide key', () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'testMethod',
    ) as Record<string, { factory: (data: unknown, ctx: unknown) => unknown }>;
    const key = Object.keys(metadata)[0];
    const factory = metadata[key].factory;

    const value = factory(undefined, {
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'uid-1', email: 'a@b.com' } }),
      }),
    });

    expect(value).toEqual({ sub: 'uid-1', email: 'a@b.com' });
  });

  it('retorna el campo pedido cuando se pasa key', () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'testMethodWithKey',
    ) as Record<string, { factory: (data: unknown, ctx: unknown) => unknown }>;
    const key = Object.keys(metadata)[0];
    const factory = metadata[key].factory;

    const value = factory('sub', {
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'uid-1', email: 'a@b.com' } }),
      }),
    });

    expect(value).toBe('uid-1');
  });

  it('retorna undefined si request.user no existe', () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'testMethod',
    ) as Record<string, { factory: (data: unknown, ctx: unknown) => unknown }>;
    const key = Object.keys(metadata)[0];
    const factory = metadata[key].factory;

    const value = factory(undefined, {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    });

    expect(value).toBeUndefined();
  });
});
