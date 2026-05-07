import { describe, expect, it, vi } from 'vitest';
import { setupSwagger } from '../swagger.setup';

describe('setupSwagger', () => {
  it('no configura Swagger en production', () => {
    process.env['NODE_ENV'] = 'production';
    const app = {} as never;
    const setupSpy = vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@nestjs/swagger').SwaggerModule,
      'setup',
    );
    setupSwagger(app);
    expect(setupSpy).not.toHaveBeenCalled();
    setupSpy.mockRestore();
  });

  it('configura Swagger fuera de production', () => {
    process.env['NODE_ENV'] = 'development';
    const swaggerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@nestjs/swagger').SwaggerModule;
    const createDocumentSpy = vi
      .spyOn(swaggerModule, 'createDocument')
      .mockReturnValue({});
    const setupSpy = vi
      .spyOn(swaggerModule, 'setup')
      .mockImplementation(() => undefined);

    setupSwagger({} as never);

    expect(createDocumentSpy).toHaveBeenCalledOnce();
    expect(setupSpy).toHaveBeenCalledOnce();
    createDocumentSpy.mockRestore();
    setupSpy.mockRestore();
  });
});
