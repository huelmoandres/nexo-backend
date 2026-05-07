import { Role } from '@prisma/client';

/**
 * Claims del JWT de Supabase Auth una vez verificado y decodificado por Passport.
 * El guard `SupabaseAuthGuard` adjunta este objeto a `request.user`.
 */
export interface AuthenticatedUser {
  /** Identificador único del usuario en Supabase (`subject` del JWT). */
  sub: string;
  /** Correo electrónico del usuario, si está incluido en el token. */
  email?: string;
  /** Rol en el sistema Nexos; puede no estar presente en tokens legacy. */
  role?: Role;
  /** Fecha de emisión del token en segundos Unix. */
  iat?: number;
  /** Fecha de expiración del token en segundos Unix; requerida para `logout`. */
  exp?: number;
  /** Claims adicionales que Supabase puede incluir en el JWT. */
  [key: string]: unknown;
}
