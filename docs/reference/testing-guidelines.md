# Testing Guidelines — Nexos Backend
**Propiedad de:** HRProgrammers
**Cuándo leer:** Antes de escribir cualquier archivo `.spec.ts` o `.e2e-spec.ts`.

---

## 1. Stack de Testing

| Herramienta | Propósito |
|---|---|
| **Vitest** | Test runner (reemplaza Jest). Más rápido, soporte nativo de ESM y TypeScript. |
| **unplugin-swc** | Procesa decoradores TypeScript de NestJS sin `ts-jest`. Usa el mismo `@swc/core` del build. |
| **vite-tsconfig-paths** | Resuelve los path aliases (`@modules/*`, `@common/*`, etc.) dentro de Vitest. |
| **@vitest/coverage-v8** | Cobertura de código usando V8 (sin istanbul). Integrado en el motor de Node.js. |
| **Testcontainers** | Levanta contenedores Docker reales para tests de integración (PostgreSQL+PostGIS, Redis, MongoDB). |
| **fishery** | Librería de factories para construir entidades de Prisma con datos consistentes. |
| **@faker-js/faker** | Generación de datos aleatorios realistas (emails, UUIDs, nombres, montos). |

---

## 2. Estructura de Archivos

```
nexos-backend/
├── src/
│   ├── config/
│   │   ├── vitest.config.ts                      ← Config tests unitarios
│   │   └── vitest.e2e.config.ts                  ← Config tests de integración
│   └── modules/
│       └── <nombre>/
│           ├── __tests__/
│           │   ├── <nombre>.service.spec.ts      ← Unit: deps mockeadas
│           │   ├── <nombre>.controller.spec.ts   ← Unit: Service mockeado
│           │   └── <nombre>.e2e-spec.ts          ← Integration: Testcontainers
│           ├── <nombre>.service.ts
│           └── <nombre>.module.ts
├── test/
│   ├── factories/
│   │   ├── user.factory.ts
│   │   ├── job.factory.ts
│   │   ├── escrow-transaction.factory.ts
│   │   ├── dispute.factory.ts
│   │   └── index.ts                              ← Barrel de factories
│   ├── mocks/
│   │   ├── storage.mock.ts
│   │   ├── payment-gateway.mock.ts
│   │   ├── expo-push.mock.ts
│   │   └── index.ts                              ← Barrel de mocks
│   └── setup/
│       ├── global-setup.ts                       ← Arranca Testcontainers una vez
│       ├── unit-setup.ts                         ← Limpia mocks entre tests unitarios
│       └── e2e-setup.ts                          ← Trunca DB entre tests e2e
```

### Convención de archivos obligatoria

| Archivo | Tipo | ¿Usa containers? | ¿Usa mocks externos? |
|---|---|---|---|
| `*.service.spec.ts` | Unit | No | Sí — todas las deps externas |
| `*.controller.spec.ts` | Unit | No | Sí — Service mockeado |
| `*.e2e-spec.ts` | Integration | Sí — Testcontainers | Solo para APIs externas |

---

## 3. Factories: Prohibido crear objetos planos en tests

**REGLA:** Ningún test puede construir un objeto de Prisma con llaves/valores literales.

```typescript
// PROHIBIDO — objeto plano, frágil y acoplado al schema
const user = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@test.com',
  role: 'CLIENT',
  // ... 10 campos más que hay que mantener sincronizados con el schema
};

// CORRECTO — la factory conoce todos los campos requeridos por Prisma
import { userFactory, heldEscrowFactory } from '@test/factories';

const client = userFactory.build({ role: 'CLIENT' });
const escrow = heldEscrowFactory.build({ amountCents: 150000 });
```

### Crear variantes de factories

```typescript
// Pasar overrides al build():
const proUser = userFactory.build({ role: 'INDEPENDENT_PRO' });

// Usar factories pre-configuradas para los estados más comunes:
import { heldEscrowFactory, completedJobFactory, secondChanceDisputeFactory } from '@test/factories';

const escrow = heldEscrowFactory.build();          // EscrowStatus.HELD con bullJobId
const job = completedJobFactory.build();           // JobStatus.COMPLETED con completedAt
const dispute = secondChanceDisputeFactory.build(); // DisputeStatus.SECOND_CHANCE con deadline
```

---

## 4. Mocks de Servicios Externos

**REGLA:** Ningún test unitario puede hacer llamadas reales a APIs externas.

Los servicios que siempre deben estar mockeados:

| Servicio | Mock | Token de inyección |
|---|---|---|
| Cloudflare R2 / AWS S3 | `storageMock` | `STORAGE_SERVICE_TOKEN` |
| Pasarela de pagos (RedPagos, MercadoPago UY) | `paymentGatewayMock` | `PAYMENT_GATEWAY_TOKEN` |
| Expo Push Notifications | `expoPushMock` | `PUSH_NOTIFICATION_SERVICE_TOKEN` |

```typescript
import { storageMock, paymentGatewayMock } from '@test/mocks';

// En el TestingModule de NestJS:
const module = await Test.createTestingModule({
  providers: [
    EscrowService,
    { provide: STORAGE_SERVICE_TOKEN, useValue: storageMock },
    { provide: PAYMENT_GATEWAY_TOKEN, useValue: paymentGatewayMock },
  ],
}).compile();

// Limpiar entre tests:
beforeEach(() => vi.clearAllMocks());

// Verificar llamadas:
expect(paymentGatewayMock.createPaymentLink).toHaveBeenCalledWith({
  jobId: expect.any(String),
  amountCents: 150000,
});
```

### Simular errores de servicios externos

```typescript
// Para un test específico, sobrescribir el mock con un error:
paymentGatewayMock.createPaymentLink.mockRejectedValueOnce(
  new Error('Gateway timeout')
);
```

---

## 5. Fixed Date: Regla Obligatoria para Lógica Temporal

**REGLA:** Cualquier test que verifique plazos (48hs Escrow, deadlines de Segunda Oportunidad, TTLs de Redis, expiración de Urgencias) DEBE usar `vi.setSystemTime()`.

**Prohibido:**
- Usar `new Date()` directamente en aserciones de tiempo
- Esperar con `setTimeout` o `sleep` en tests
- Calcular fechas relativas sin anclarlas a un timestamp fijo

```typescript
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { addBusinessDays } from 'date-fns';

// Fecha fija que no cambia nunca. Se elige un lunes para que +2 días hábiles
// sea predecible: 2026-06-01 (lunes) + 2 días hábiles = 2026-06-03 (miércoles).
const FIXED_NOW = new Date('2026-06-01T10:00:00.000Z');

describe('EscrowService — Aceptación Silenciosa', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debe calcular approvalDeadline como FIXED_NOW + 2 días hábiles', () => {
    // date-fns.addBusinessDays usa new Date() internamente →
    // vi.setSystemTime lo intercepta correctamente.
    const deadline = addBusinessDays(new Date(), 2);

    expect(deadline.toISOString()).toBe('2026-06-03T10:00:00.000Z');
  });

  it('debe marcar el Escrow como RELEASED si el cliente no disputa en 48hs', async () => {
    const escrow = heldEscrowFactory.build();
    // Avanzar el tiempo ficticio más allá del deadline:
    vi.setSystemTime(addBusinessDays(FIXED_NOW, 3)); // +3 días hábiles

    const result = await escrowService.checkSilentAcceptance(escrow.id);

    expect(result.status).toBe('RELEASED');
  });
});
```

### Calendario de referencia para tests temporales

| Fecha fija | Día | +2 días hábiles | +48hs calendario |
|---|---|---|---|
| `2026-06-01T10:00:00Z` | Lunes | Miércoles 03/06 | Miércoles 03/06 |
| `2026-06-04T10:00:00Z` | Jueves | Lunes 08/06 | Sábado 06/06 |
| `2026-06-05T10:00:00Z` | Viernes | Martes 09/06 | Domingo 07/06 |

Usar `addBusinessDays` (no `+48h`) para respetar los fines de semana.

---

## 6. Cobertura Mínima Obligatoria

La cobertura se verifica con `npm run test:cov` (o `npm run test:cov:strict`, que es un alias explícito). El build falla si no se alcanzan los umbrales globales.

| Métrica global (`src/config/vitest.config.ts`) | Umbral mínimo |
|---|---|
| `lines` | **95%** |
| `functions` | **95%** |
| `branches` | **95%** |
| `statements` | **95%** |

Los DTOs, módulos (`.module.ts`) y `main.ts` están excluidos del reporte de cobertura.

---

## 7. Tests de Integración con Testcontainers

Los tests `*.e2e-spec.ts` usan bases de datos reales. Prerequisito: Docker corriendo.

```typescript
// src/modules/escrow/__tests__/escrow.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll } from 'vitest';
import { heldEscrowFactory, userFactory } from '@test/factories';

describe('EscrowModule — Integration', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    // DATABASE_URL fue inyectada por global-setup.ts apuntando al container
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  });

  it('debe liberar fondos al profesional dentro de prisma.$transaction()', async () => {
    // Arrange: crear datos reales en el container de PostgreSQL
    const client = await prisma.user.create({ data: userFactory.build() });
    const escrow = await prisma.escrowTransaction.create({
      data: heldEscrowFactory.build({ jobId: '...' }),
    });

    // Act: llamar al servicio real
    await escrowService.releaseFunds(escrow.id, client.id);

    // Assert: verificar en la DB real
    const updated = await prisma.escrowTransaction.findUniqueOrThrow({
      where: { id: escrow.id },
    });
    expect(updated.status).toBe('RELEASED');
    expect(updated.releasedAt).not.toBeNull();
  });
});
```

---

## 8. Comandos de Testing

```bash
# Tests unitarios (sin Docker)
npm run test

# Tests unitarios en modo watch (hot reload)
npm run test:watch

# Tests unitarios con reporte de cobertura
npm run test:cov

# Tests de integración (requiere Docker)
npm run test:e2e

# Todos los tests (unit + e2e)
npm run test:all
```
