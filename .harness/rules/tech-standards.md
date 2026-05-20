# Rules: Estándares Técnicos Avanzados
**Scope:** Aplica a todo el codebase de `src/`. Son patrones de ingeniería que previenen clases enteras de bugs antes de que ocurran.
**Referencia:** `docs/reference/coding-guidelines.md` para reglas de estilo. Este archivo cubre patrones de diseño y decisiones de arquitectura interna.

---

## REGLA 1: Value Object `Money` — Prohibido Float para Dinero

### El problema
JavaScript tiene aritmética de punto flotante IEEE 754:
```typescript
0.1 + 0.2 === 0.30000000000000004  // true
```
En transacciones financieras, este error de redondeo es inaceptable. Una comisión de 12.5% sobre $1,234.56 UYU debe ser exactamente $154.32, no $154.31999...

### La solución: enteros en centavos
Toda cantidad de dinero en el sistema Nexos se representa como **enteros en centavos** (pesos uruguayos × 100). `$1,234.56 UYU = 123456 centavos`.

### Implementación obligatoria

El Value Object vive en `src/common/types/money.value-object.ts` y es la **única** forma de representar dinero en la lógica de negocio:

```typescript
export class Money {
  private constructor(private readonly cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error(`Money must be integer cents, received: ${cents}`);
    }
    if (cents < 0) {
      throw new Error(`Money cannot be negative, received: ${cents}`);
    }
  }

  /** Crea un Money desde centavos (valor almacenado en DB) */
  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  /** Crea un Money desde pesos UYU (ej. input del usuario) */
  static fromPesos(pesos: number): Money {
    return new Money(Math.round(pesos * 100));
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    if (other.cents > this.cents) throw new Error('Insufficient funds');
    return new Money(this.cents - other.cents);
  }

  /** Calcula un porcentaje redondeado a centavos enteros */
  percentage(pct: number): Money {
    return new Money(Math.round(this.cents * pct / 100));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** Devuelve el valor en centavos para guardar en DB (campo Int de Prisma) */
  toCents(): number { return this.cents; }

  /** Devuelve el valor en pesos para mostrar al usuario */
  toPesos(): number { return this.cents / 100; }

  toString(): string { return `$${this.toPesos().toFixed(2)} UYU`; }
}
```

### En Prisma Schema
Los campos de dinero se almacenan como `Int` (centavos). **Nunca como `Float` ni `Decimal` de JavaScript.**

```prisma
model EscrowTransaction {
  amountCents     Int  // Monto total en centavos
  commissionCents Int  // Comisión de Nexos en centavos
  netAmountCents  Int  // Monto que recibe el profesional en centavos
}
```

### Ejemplo de uso en Service
```typescript
const amount = Money.fromCents(escrow.amountCents);       // 123456 → $1,234.56
const commission = amount.percentage(12.5);               // 15432 → $154.32
const net = amount.subtract(commission);                  // 108024 → $1,080.24

await tx.escrowTransaction.update({
  where: { id },
  data: {
    commissionCents: commission.toCents(),
    netAmountCents: net.toCents(),
  },
});
```

---

## REGLA 2: Patrón de Interfaces para Integraciones Externas

Toda integración con un servicio externo (almacenamiento, pagos, notificaciones, identidad) DEBE estar detrás de una interfaz. El módulo de negocio depende de la interfaz, no de la implementación.

### Estructura obligatoria

```
src/modules/storage/
├── interfaces/
│   └── storage.service.interface.ts   ← Contrato
├── storage.service.ts                 ← Implementación (Cloudflare R2)
└── storage.module.ts
```

### Ejemplo

```typescript
// src/modules/storage/interfaces/storage.service.interface.ts
export interface IStorageService {
  generatePresignedPutUrl(userId: string, fileType: string, ext: string): Promise<{ uploadUrl: string; key: string }>;
  generatePresignedGetUrl(key: string, bucket: string): Promise<string>;
  deleteObject(key: string, bucket: string): Promise<void>;
}

export const STORAGE_SERVICE_TOKEN = Symbol('IStorageService');
```

```typescript
// En el módulo de usuarios — depende de la interfaz, no de Cloudflare
@Injectable()
export class UsersService {
  constructor(
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
  ) {}
}
```

### Aplica obligatoriamente a

| Integración | Interface | Implementación concreta |
|---|---|---|
| Almacenamiento S3/R2 | `IStorageService` | `CloudflareR2Service` |
| Pasarela de pagos | `IPaymentGateway` | `RedPagosService`, `MercadoPagoService` |
| Validación de identidad | `IIdentityVerifier` | `MetaMapService` |
| Notificaciones push | `IPushNotificationService` | `ExpoPushService` |

---

## REGLA 3: Prohibición de `any` y TypeScript Estricto

### Prohibido explícitamente

```typescript
// PROHIBIDO — estos patrones serán rechazados en code review
const data: any = response.data;
const result = value as any;
// @ts-ignore
// @ts-expect-error (sin comentario justificado)
```

### Correcto para respuestas de APIs externas

Cuando se recibe una respuesta de tipo desconocido (API externa, webhooks), usar `unknown` con type narrowing:

```typescript
// Respuesta de API externa de identidad (MetaMap, etc.)
const rawResponse: unknown = await externalApi.verify(documents);

// Validar con class-transformer antes de usar
const verified = plainToInstance(IdentityVerificationResponseDto, rawResponse);
const errors = await validate(verified);
if (errors.length > 0) {
  throw new InternalServerErrorException('Invalid response from identity API');
}
```

### Configuración obligatoria en `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

`noUnusedLocals` y `noUnusedParameters` previenen variables zombie que confunden al agente en sesiones futuras.

---

## REGLA 4: Límites de Tamaño como Señal de Deuda Técnica

Estos límites no son arbitrarios. Son la señal de que un artefacto está violando el principio de Responsabilidad Única y debe ser refactorizado **antes** de agregar nueva funcionalidad.

| Artefacto | Límite | Acción obligatoria si supera |
|---|---|---|
| `*.service.ts` | 200 líneas | Extraer sub-service o helper en `src/modules/<dominio>/helpers/` |
| `*.controller.ts` | 100 líneas | Dividir en múltiples controllers con prefijo de ruta |
| Función / método | 30 líneas | Extraer a función privada con nombre descriptivo |
| DTO (campos) | 15 campos | Revisar si el endpoint tiene exceso de responsabilidad |
| `*.module.ts` con providers | 10 providers | El módulo está haciendo demasiado, dividir en sub-módulos |

### Ejemplo de extracción de sub-service

```typescript
// Antes: EscrowService de 350 líneas haciendo demasiado
class EscrowService {
  fundEscrow() { ... }
  releaseEscrow() { ... }
  calculateCommission() { ... }  // lógica de negocio financiero
  sendReleaseNotification() { ... } // responsabilidad de NotificationService
  generateAuditEntry() { ... }   // responsabilidad de AuditService
}

// Después: responsabilidades separadas
class EscrowService {          // 90 líneas — orquesta
  constructor(
    private readonly commissionCalculator: CommissionCalculatorService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationService,
  ) {}
}
class CommissionCalculatorService { ... }  // cálculos financieros puros
```

---

## REGLA 5: Nomenclatura de Constantes de Negocio

Las constantes que representan estados, tipos o roles del dominio se definen como `enum` de TypeScript, nunca como strings sueltos:

```typescript
// Correcto: enum en src/common/enums/
export enum EscrowStatus {
  HELD = 'HELD',
  HELD_DISPUTED = 'HELD_DISPUTED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
}

// Incorrecto: string suelto susceptible a typos
if (escrow.status === 'released') { ... }  // BUG: debería ser 'RELEASED'
```

Los enums de dominio viven en `src/common/enums/` y son compartidos por todos los módulos que los necesiten.

---

## REGLA 6: Documentación JSDoc en API pública

Los métodos **públicos** de Services, Repositories y contratos inyectables (`interface` de proveedores) deben documentarse con JSDoc:

- `@param` por cada parámetro relevante (nombre y significado en dominio).
- `@returns` cuando el valor de retorno no sea obvio solo por el tipo.

Los Controllers priorizan `@nestjs/swagger` (`@ApiOperation`, DTOs); puede añadirse un bloque de clase JSDoc que resuma el recurso.

La configuración de herramientas (Vitest, etc.) vive en `src/config/` junto al resto de configuración del proyecto, no en la raíz del repo.

---

## REGLA 7: Configuración tipada con `ConfigType` — prohibido `ConfigService.get<T>('string')`

### El problema

Acceder a la configuración con strings literales de ruta rompe el tipado y es propenso a errores silenciosos:

```typescript
// PROHIBIDO — ningún servicio debe hacer esto
const secret = this.configService.get<string>('auth.supabaseJwtSecret');
// Si el key cambia, el error aparece solo en runtime, no en compilación
```

### El patrón obligatorio

Cada namespace tiene su archivo `src/config/<nombre>.config.ts` con `registerAs()`. Los consumidores inyectan el objeto tipado completo:

```typescript
// src/config/auth.config.ts
export const authConfig = registerAs('auth', () => ({
  supabaseJwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? '',
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
}));

// En el servicio / guard / estrategia consumidora:
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { authConfig } from '@config/auth.config';

constructor(
  @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
) {
  // Acceso tipado — TypeScript detecta typos en compilación
  const secret = config.supabaseJwtSecret;
}
```

En factories de módulos (proveedor de Redis, etc.), el patrón es el mismo:

```typescript
{
  provide: REDIS_AUTH_CLIENT,
  inject: [authConfig.KEY],
  useFactory: (config: ConfigType<typeof authConfig>): Redis =>
    new Redis(config.redisUrl, { maxRetriesPerRequest: 1 }),
}
```

### Reglas derivadas

- `ConfigService` puede usarse en `main.ts` fuera del contexto DI si es necesario, pero nunca en clases inyectables.
- Cada namespace de config se registra en `AppModule` dentro de `ConfigModule.forRoot({ load: [...] })`.
- Los tests unitarios que necesitan config pasan un objeto plano `{ clave: valor }` al constructor — sin instanciar `ConfigService`.
- Los archivos `*.config.ts` no se tocan al cambiar consumidores; solo cambian los consumidores.

---

## REGLA 8: Performance — checklist y olfatos (no sustituye profiling sistemático)

**Objetivo:** evitar regresiones obvias en rutas calientes sin imponer micro-optimización en todo el código.

### Dominios ya sensibles en el proyecto

- **Búsqueda** (`search.repository.ts`): PostGIS (`ST_DWithin`) + FTS con categorías + expansión IA (`SearchQueryExpanderService`) + fallback pg_trgm (`word_similarity`); SQL siempre parametrizado; revisar índices GiST cuando se añadan filtros geo.
- **Usuarios** (`users.repository.ts`): transacciones explícitas donde haya invariantes; evitar transacciones largas innecesarias.

### Olfatos a vigilar

| Olfato | Riesgo | Qué hacer |
|--------|--------|-----------|
| `findMany` / queries en bucle por elemento (N+1) | Latencia y carga en DB | Batch, `include` selectivo, o una query agregada |
| `$queryRawUnsafe` con input usuario | SQL injection / planes inesperados | Preferir Prisma o `Prisma.sql` con parámetros |
| Lecturas sin límites en listados públicos | DoS indirecto / memoria | Paginación obligatoria (ver [api-rules](api-rules.md)) |
| Caché Redis duplicada o sin TTL | Memoria / datos obsoletos | Convención por dominio (p. ej. categorías) documentada en el módulo |

### Cuándo perfilar de verdad

Tras medir con datos realistas (concurrentes, volúmenes de producción o stress seed): CPU en Node, tiempos de query en PostgreSQL (`EXPLAIN ANALYZE`), y latencia p95 de endpoints. Este checklist no reemplaza esa pasada.
