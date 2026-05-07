import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Decorador de parámetro que extrae el usuario autenticado de `request.user`.
 * Requiere que `SupabaseAuthGuard` haya sido ejecutado previamente.
 *
 * @param data - Clave opcional de `AuthenticatedUser`; si se omite retorna el objeto completo.
 * @returns El usuario completo, o el valor de la clave solicitada, o `undefined` si no hay usuario.
 *
 * @example
 * // Obtener el objeto completo
 * \@Get('me')
 * getMe(\@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * @example
 * // Obtener solo el sub
 * \@Get('me')
 * getMe(\@CurrentUser('sub') sub: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
