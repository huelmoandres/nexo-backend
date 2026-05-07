import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ProblemDetail } from '@common/dto/problem-detail.dto';

export function setupSwagger(app: INestApplication): void {
  if (process.env['NODE_ENV'] === 'production') return;

  const config = new DocumentBuilder()
    .setTitle('Nexos API')
    .setDescription(
      `**Marketplace de Servicios — HRProgrammers**

Documentación interactiva de la API REST de Nexos.

## Autenticación
Todos los endpoints protegidos requieren un JWT emitido por **Supabase Auth**.
1. Obtén el token desde tu cliente Supabase (\`session.access_token\`).
2. Haz clic en el botón **Authorize** (candado) e ingresa el token.
3. El header \`Authorization: Bearer <token>\` se adjuntará automáticamente.

## Errores
Todos los errores siguen el estándar **RFC 7807**. Ver schema \`ProblemDetail\`.

## Links
- [OpenAPI JSON](/api/docs-json) — Para importar en Postman
- [Guía de Testing](/docs/reference/api-testing.md) — Postman Environment Variables

## Estado actual
La documentación expone únicamente módulos activos en esta versión (\`auth\`, \`users\`, \`health\`, \`categories\`, \`search\`).`,
    )
    .setVersion('1.0')
    .setContact('HRProgrammers', 'https://nexos.uy', 'dev@hrprogrammers.com')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT de Supabase Auth. Obtener con supabase.auth.signInWithPassword()',
      },
      'supabase-jwt',
    )
    .addTag(
      'auth',
      'Sincronización de usuario con PostgreSQL y logout seguro (Redis Blocklist)',
    )
    .addTag(
      'users',
      'Gestión de perfiles, jerarquía de empresas y verificación KYC',
    )
    .addTag('health', 'Liveness y readiness para operación')
    .addTag(
      'categories',
      'Gestión jerárquica de categorías con caché Redis. Mutaciones requieren SUPER_ADMIN.',
    )
    .addTag(
      'search',
      'Búsqueda geoespacial de profesionales. ST_DWithin + FTS español. Ruta pública.',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ProblemDetail],
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: 2,
      tagsSorter: 'alpha',
    },
    customSiteTitle: 'Nexos API Docs',
  });
}
