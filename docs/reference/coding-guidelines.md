# Coding Guidelines - Nexos
**Framework:** NestJS / TypeScript

## 1. Documentación (TSDoc)
- No comentar obviedades.
- Usar bloques `/** ... */` para documentar la intención de funciones públicas, parámetros y excepciones lanzadas.
- Prohibido dejar código comentado o archivos basura (.bak, .old). Si no sirve, se borra.

## 2. Centralización de Configuración

- **Directorio:** `src/config/` — cada namespace tiene su propio `<nombre>.config.ts` registrado con `registerAs()`.
- **Regla:** Ningún valor estático (tiempos de cron, comisiones, secretos) debe estar en el código. Todos se cargan mediante `@nestjs/config`.
- **Inyección tipada obligatoria:** Los consumidores inyectan el objeto completo del namespace con `@Inject(xConfig.KEY) config: ConfigType<typeof xConfig>`. **Prohibido** usar `ConfigService.get<T>('namespace.key')` con string literal en clases inyectables.

```typescript
// Correcto
constructor(
  @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
) {
  const secret = config.supabaseJwtSecret; // tipado completo
}

// PROHIBIDO
constructor(private readonly configService: ConfigService) {
  const secret = configService.get<string>('auth.supabaseJwtSecret'); // string literal
}
```

- **Tests unitarios:** Pasar un objeto plano `{ clave: valor }` directamente al constructor, sin instanciar `ConfigService`.
- **Validación en startup:** Cada archivo de config valida o aplica defaults seguros antes de exponerse. El `AppModule` registra todos los configs en `ConfigModule.forRoot({ isGlobal: true, load: [...configs] })`.

## 3. Logging y auditoría
- **Motor:** Pino (`AppLoggerModule`) + `Logger` de NestJS en dominio. Prohibido `console.log` en `src/`.
- **Correlation ID:** header `x-correlation-id`; ver `@common/observability` y [logging-audit.md](logging-audit.md).
- **Logs estructurados:** campo `op` del [catálogo](../../.harness/specs/observability-catalog.md); incluir `phase` y `correlationId` en flujos críticos.
- **AuditLog:** mutaciones de negocio (dinero, roles) — `BusinessAuditService`.
- **ProcessAudit:** webhooks y workers — `ProcessAuditService` con payloads sanitizados.
- **Sentry:** errores 5xx vía `GlobalExceptionFilter`; scope con `correlationId`.

## 4. Validaciones
- **Librería:** `class-validator` con decoradores.
- **Transformación:** Uso obligatorio de `class-transformer` para asegurar que los tipos de los DTOs coincidan con la lógica interna.

## 4.1 RBAC y planes en services

En controllers de mutación: aplicar guards de rol en el controller; validar ownership en el service. Si el recurso está sujeto a suscripción (`ProfessionalProfile`, `Company`), llamar a `EntitlementsService` antes de `create`/`update` en Prisma. Documentar ambos en la spec del módulo (plantilla en [.harness/rules/docs-first.md](../../.harness/rules/docs-first.md) §9).

---

## 5. TypeScript Path Aliases

Prohibido usar rutas relativas con más de un nivel de profundidad (`../../`). Cualquier import que cruce el límite de un módulo usa un alias absoluto.

**Configuración en `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "paths": {
      "@modules/*": ["src/modules/*"],
      "@common/*":  ["src/common/*"],
      "@config/*":  ["src/config/*"],
      "@prisma/*":  ["src/prisma/*"]
    }
  }
}
```

**Correcto:**
```typescript
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { Money } from '@common/types/money.value-object';
import { searchConfig } from '@config/search.config';
```

**Incorrecto:**
```typescript
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
```

Los alias deben registrarse también en `nest-cli.json` bajo `compilerOptions.tsConfigPath` y en el script de build para que los paths se resuelvan correctamente en producción con `tsc-alias` o `tsconfig-paths`.

---

## 6. Principios SOLID Aplicados a NestJS

Solo los dos más críticos para este proyecto. Los demás son consecuencia natural de la arquitectura de NestJS con módulos e inyección de dependencias.

### S — Responsabilidad Única (Single Responsibility)
Un `Service` tiene una sola razón para cambiar. Si `EscrowService` empieza a manejar el envío de notificaciones push, esa lógica se extrae a `NotificationService` y se inyecta como dependencia.

**Señales de alerta que indican violación:**
- Un `*.service.ts` supera las **200 líneas** → extraer sub-service o helper.
- Un `*.controller.ts` supera las **100 líneas** → dividir endpoints en múltiples controllers.
- Un método supera las **30 líneas** → extraer a función privada con nombre descriptivo.

### D — Inversión de Dependencias (Dependency Inversion)
Los módulos de negocio dependen de **interfaces**, no de implementaciones concretas. Esto aplica obligatoriamente a todas las integraciones externas:

```typescript
// Correcto: el módulo depende de la abstracción
@Injectable()
export class UsersService {
  constructor(
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
  ) {}
}

// Incorrecto: acoplamiento directo a Cloudflare R2
constructor(private readonly cloudflareStorage: CloudflareR2Service) {}
```

Si HRProgrammers cambia de Cloudflare R2 a AWS S3, solo se modifica la implementación concreta. `UsersService` no cambia.

**Aplica obligatoriamente a:** `StorageService`, pasarelas de pago, API de identidad (MetaMap), servicio de notificaciones (Expo).

---

## 7. Estructura de `src/common/`

Todo artefacto reutilizable entre más de un módulo vive en `src/common/`. Prohibido duplicar código que ya existe aquí.

```
src/common/
├── dto/
│   ├── pagination.dto.ts           # PaginationQueryDto — extienden todos los endpoints de listas
│   └── paginated-response.dto.ts   # Envuelve { data[], meta } para respuestas paginadas
├── decorators/
│   └── current-user.decorator.ts   # @CurrentUser() — extrae req.user del token
├── filters/
│   └── http-exception.filter.ts    # Filtro global RFC 7807 — registrado en main.ts
├── interceptors/
│   └── transform.interceptor.ts    # Envuelve toda respuesta en { data, meta }
├── guards/
│   └── (guards compartidos entre módulos)
├── pipes/
│   └── parse-uuid.pipe.ts          # Valida que un :id en los params sea un UUID válido
└── types/
    └── money.value-object.ts       # Value Object Money (ver .harness/rules/tech-standards.md)
```

**Regla:** si un elemento se usa en más de un módulo, su lugar es `src/common/`. No copiar-pegar.

---

## 8. Gestión Universal de Fechas y Tiempo

### Estándar de almacenamiento en PostgreSQL
Todos los campos de fecha en el schema de Prisma usan el tipo `DateTime` con `@db.Timestamptz` (timestamp with timezone). La base de datos almacena siempre en **UTC**. Prisma devuelve objetos `Date` de JavaScript que ya están en UTC.

```prisma
model EscrowTransaction {
  createdAt  DateTime @default(now()) @db.Timestamptz
  releasedAt DateTime? @db.Timestamptz
}
```

### Zona de negocio (`APP_TIMEZONE`)

- Variable: `APP_TIMEZONE` (default `America/Montevideo`) en `app.config.ts`.
- **Persistencia:** siempre UTC en PostgreSQL (`Timestamptz`).
- **Días calendario** (cotización BCU, `stale`, crons Bull con `tz`): usar `@common/date/app-timezone` (`calendarDateString`, `isEffectiveDateStale`), no `format(new Date(), …)` ni medianoche UTC.

### Librería oficial: `date-fns` + `date-fns-tz`

**Justificación técnica de la elección sobre Day.js:**
- Opera sobre objetos `Date` nativos de JavaScript sin wrappers. Ideal para pasar fechas directamente a Prisma y BullMQ (que trabajan con ms timestamps).
- **Tree-shakeable:** solo se importa la función que se necesita, no la librería completa.
- `addBusinessDays()` resuelve exactamente el cálculo de "48 horas hábiles" del Escrow sin lógica manual.
- Day.js es superior en UI/frontend por su API chainable, pero en un backend sin DOM, `date-fns` es más eficiente y predecible.

**Casos de uso concretos en Nexos:**

```typescript
import { addBusinessDays, differenceInSeconds, isPast } from 'date-fns';

// Calcular deadline de aceptación silenciosa del Escrow (+48hs hábiles)
const releaseDate = addBusinessDays(job.completedAt, 2);
const delayMs = differenceInSeconds(releaseDate, new Date()) * 1000;

// Verificar si un token JWT expiró
const isExpired = isPast(new Date(jwtPayload.exp * 1000));

// Calcular TTL de Redis para la blocklist de tokens
const ttlSeconds = differenceInSeconds(new Date(exp * 1000), new Date());
```

**Prohibido:**
```typescript
// Aritmética manual de fechas — fuente de bugs en horario de verano y fines de semana
const deadline = new Date(job.completedAt.getTime() + 48 * 60 * 60 * 1000);
```

---

## 9. Seguridad HTTP

Tres capas de defensa configuradas como middleware global en `src/main.ts`:

### Capa 1: `helmet` — Headers de seguridad HTTP
```typescript
import helmet from 'helmet';
app.use(helmet());
```
Activa automáticamente: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` y otros headers de protección.

### Capa 2: Rate Limiting — `@nestjs/throttler`
Configuración en `src/config/security.config.ts`:

```typescript
export default registerAs('security', () => ({
  throttle: {
    globalTtl: 60,       // segundos
    globalLimit: 100,    // requests por IP por TTL
    authTtl: 60,
    authLimit: 10,       // más estricto para /auth/*
  },
}));
```

Aplicación (implementado en `AppModule` + `@nestjs/throttler`):
- **Global:** `ThrottlerGuard` como `APP_GUARD` → 100 req / 60s por IP (cabeceras `X-RateLimit-*`).
- **Health:** `@SkipThrottle()` en `HealthController` (probes sin 429).
- **Auth:** `@Throttle({ default: { limit: 10, ttl: 60_000 } })` en `AuthController`.
- **Consent portfolio (público):** `@Throttle({ default: { limit: 30, ttl: 60_000 } })` en `PortfolioConsentController`.

### Capa 3: TypeScript + `ValidationPipe` como barrera contra inyecciones

El `ValidationPipe` global se configura con opciones estrictas que actúan como segunda capa de sanitización:

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // elimina campos no declarados en el DTO
  forbidNonWhitelisted: true, // lanza error si llegan campos extra
  transform: true,           // transforma tipos (string → number en query params)
  transformOptions: { enableImplicitConversion: false }, // sin conversiones implícitas peligrosas
}));
```

**Prohibido:** usar `any` explícito o `@ts-ignore` (ver `.harness/rules/tech-standards.md`).

---

## 10. Metadatos SEO y OpenGraph

El backend provee los metadatos estructurados para que los perfiles de profesionales sean compartibles en redes sociales y optimizados para buscadores.

### Endpoint dedicado
- **Ruta:** `GET /professionals/:id/metadata`
- **Protección:** Pública (sin guard) — su propósito es ser consumido por crawlers y el SSR del frontend.
- **Cache:** Resultado cacheado en Redis por 10 minutos (los perfiles no cambian en tiempo real).

### Estructura de respuesta

```json
{
  "title": "Juan Pérez — Electricista | Nexos",
  "description": "Profesional verificado con 4.8 estrellas. Disponible en Montevideo.",
  "ogImage": "https://nexos-public.r2.cloudflarestorage.com/usr_abc/profile/avatar.jpg",
  "ogUrl": "https://nexos.com.uy/professionals/usr_abc123",
  "canonicalUrl": "https://nexos.com.uy/professionals/usr_abc123",
  "structuredData": {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Juan Pérez",
    "jobTitle": "Electricista",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Montevideo",
      "addressCountry": "UY"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "23"
    }
  }
}
```

**Regla de imágenes:** La `ogImage` usa la foto de perfil del bucket `nexos-public` (URL pública permanente). No requiere URL firmada. Si el profesional no tiene foto de perfil, se usa la imagen por defecto de Nexos.

---

## 11. Documentación de API con Swagger (`@nestjs/swagger`)

**Regla:** Todo endpoint que salga a producción debe ser visible y comprensible en `/api/docs`. Un endpoint sin decoradores de Swagger se considera **incompleto** y no cumple la Definition of Done.

### Controllers: decoradores obligatorios

```typescript
@ApiTags('escrow')                        // en la clase del Controller
@ApiBearerAuth('supabase-jwt')            // si todos los endpoints requieren JWT
@Controller('escrow')
export class EscrowController {

  @Post('fund')
  @ApiOperation({ summary: 'Fondear Escrow tras confirmación de pago' })
  @ApiResponse({ status: 201, type: EscrowResponseDto })
  @ApiResponse({ status: 400, type: ProblemDetail })
  @ApiResponse({ status: 401, type: ProblemDetail })
  fundEscrow(@Body() dto: FundEscrowDto) { ... }
}
```

Decoradores mínimos por método:

| Decorador | Dónde | Obligatorio |
|---|---|---|
| `@ApiTags('nombre')` | Clase Controller | Sí |
| `@ApiBearerAuth('supabase-jwt')` | Clase (si requiere JWT) | Sí |
| `@ApiOperation({ summary })` | Cada método | Sí |
| `@ApiResponse({ status, type })` | Al menos el caso 2xx y el error principal | Sí |

### DTOs de entrada: `@ApiProperty()` obligatorio

Cada propiedad del DTO de entrada lleva `@ApiProperty()` con `example` y `description`.

```typescript
export class FundEscrowDto {
  @ApiProperty({ example: 'clx8a2b3c0000xy', description: 'ID del Job a fondear' })
  @IsString()
  jobId!: string;

  @ApiProperty({ example: 150000, description: 'Monto en centavos (UYU × 100). Ej: 1500.00 UYU = 150000' })
  @IsInt()
  @Min(1)
  amountInCents!: number;

  @ApiPropertyOptional({ example: 'abc-123-xyz', description: 'Clave de idempotencia (opcional, generada por el cliente)' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
```

Reglas:
- `@ApiPropertyOptional()` para campos con `@IsOptional()`.
- Prohibido publicar un DTO sin `@ApiProperty()` — el campo no aparece en el UI de Swagger ni en el JSON exportado a Postman.
- El campo `example` debe ser realista, nunca `'string'` o `0` genéricos.

### DTOs de respuesta: clases separadas

Los Response DTOs son clases distintas a los DTOs de entrada. Esto evita exponer campos internos (ej. `fileKey` de S3, `bullJobId`) en la documentación pública.

```typescript
// ✅ Correcto: clase separada para la respuesta
export class EscrowResponseDto {
  @ApiProperty({ example: 'clx8a2b3c0000xy' })
  id!: string;

  @ApiProperty({ enum: EscrowStatus, example: EscrowStatus.HELD })
  status!: EscrowStatus;

  @ApiProperty({ example: 150000, description: 'Monto retenido en centavos' })
  amountInCents!: number;
}

// ❌ Incorrecto: exponer la entidad Prisma directamente
// return this.prisma.escrowTransaction.findUnique(...)
```

### Errores RFC 7807 en Swagger

El schema `ProblemDetail` se registra en `main.ts` vía `extraModels`. Para referenciarlo en los controllers:

```typescript
@ApiResponse({
  status: 422,
  description: 'Escrow ya existe para este Job (idempotencia)',
  schema: { $ref: '#/components/schemas/ProblemDetail' },
})
```

### Acceso a la documentación

- **UI interactivo:** `http://localhost:3000/api/docs`
- **JSON exportable:** `http://localhost:3000/api/docs-json`
- **Solo disponible en** `NODE_ENV !== 'production'`

Ver [docs/reference/api-testing.md](api-testing.md) para el flujo de Postman.
