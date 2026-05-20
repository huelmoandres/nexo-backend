import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as public (bypasses global SupabaseAuthGuard).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
