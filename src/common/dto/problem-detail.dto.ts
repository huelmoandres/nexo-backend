import { ApiProperty } from '@nestjs/swagger';

/**
 * Modelo de error estándar RFC 7807 (Problem Details for HTTP APIs).
 *
 * Registrado globalmente en Swagger vía `extraModels` en `swagger.setup.ts`.
 * Los controllers referencian este schema con:
 *   @ApiResponse({ schema: { $ref: '#/components/schemas/ProblemDetail' } })
 *
 * El GlobalExceptionFilter es responsable de producir esta forma en cada error.
 */
export class ProblemDetail {
  @ApiProperty({
    example: 'https://nexos.com/errors/auth-invalid-token',
    description: 'URI que identifica el tipo de error (kebab-case del code).',
  })
  type!: string;

  @ApiProperty({
    example: 'Token inválido',
    description: 'Descripción breve del error legible por humanos.',
  })
  title!: string;

  @ApiProperty({
    example: 401,
    description: 'Código HTTP del error.',
  })
  status!: number;

  @ApiProperty({
    example: 'El JWT no pudo validarse o ha expirado.',
    description: 'Explicación detallada para el desarrollador.',
  })
  detail!: string;

  @ApiProperty({
    example: 'AUTH_INVALID_TOKEN',
    description:
      'Slug en SCREAMING_SNAKE_CASE. Lista canónica: docs/reference/api-standards.md.',
  })
  code!: string;
}
