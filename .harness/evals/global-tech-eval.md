# Eval: Global Tech Standards — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist en cualquier módulo antes de hacer PR, y obligatoriamente antes del primer deploy a staging.
**Referencias:** `docs/reference/coding-guidelines.md` + `.harness/rules/tech-standards.md` + `.harness/rules/api-rules.md`

---

## Checklist de Path Aliases

- [ ] Ningún import inter-módulo usa rutas relativas con más de un nivel (`../../`). Toda referencia entre módulos distintos usa los aliases configurados en `tsconfig.json`.
- [ ] Los aliases obligatorios son los siguientes. Si no están en `tsconfig.json`, agregarlos antes de continuar:
  ```json
  {
    "paths": {
      "@modules/*": ["src/modules/*"],
      "@common/*":  ["src/common/*"],
      "@config/*":  ["src/config/*"],
      "@prisma/*":  ["src/prisma/*"]
    }
  }
  ```
- [ ] Los imports dentro del mismo módulo pueden usar rutas relativas cortas (`./service`, `../dto/create.dto`). Solo los imports que cruzan límites de módulo requieren alias.
- [ ] El script de lint incluye la regla `@typescript-eslint/no-restricted-imports` (o equivalente) para detectar violaciones de path alias en CI.

---

## Checklist de Configuración Centralizada

- [ ] Ningún archivo en `src/modules/**` accede directamente a `process.env`. El acceso a variables de entorno se hace exclusivamente a través de los objetos de configuración tipados.
- [ ] Cada namespace de configuración tiene su archivo en `src/config/<nombre>.config.ts` registrado con `registerAs()` de `@nestjs/config`. Ejemplo: `src/config/auth.config.ts`, `src/config/app.config.ts`.
- [ ] Los consumidores de configuración inyectan el objeto tipado mediante `@Inject(xConfig.KEY) config: ConfigType<typeof xConfig>` — **nunca** `ConfigService.get<T>('namespace.key')` con string literal.
- [ ] El `AppModule` registra `ConfigModule.forRoot({ isGlobal: true, load: [...configs] })` cargando todos los archivos de configuración.
- [ ] Las variables sensibles (secrets, API keys) nunca aparecen en logs de Pino. Los objetos de config las encapsulan como opaque strings y el logger las omite.
- [ ] Los tests unitarios que dependen de configuración usan objetos planos `{ clave: valor }` pasados directamente al constructor — no instancian `ConfigService`.

---

## Checklist de Fechas y Timezone

- [ ] Todos los campos `DateTime` en el schema de Prisma tienen el atributo `@db.Timestamptz`. Verificar con `grep -n "DateTime" prisma/schema.prisma` — ninguna línea con `DateTime` debe carecer de `@db.Timestamptz`.
- [ ] Ningún método de Service usa aritmética manual de fechas (`new Date(date.getTime() + 48 * 60 * 60 * 1000)`). Se usa exclusivamente `date-fns`: `addBusinessDays`, `addHours`, `differenceInSeconds`, etc.
- [ ] Las fechas se almacenan y comparan siempre en UTC. Ningún código convierte a zona horaria local antes de persistir.
- [ ] La librería `moment.js` o `dayjs` no está instalada en `package.json`. Solo `date-fns`.

---

## Checklist de Errores RFC 7807

- [ ] Ningún controller o service lanza `new Error('mensaje')` crudo. Solo se usan excepciones de NestJS extendidas o un `NexosException` custom que incluye el `slug`.
- [ ] Ningún controller lanza `throw new HttpException('mensaje', 400)` sin un slug de error. El filtro global necesita el slug para construir el campo `code` del RFC 7807.
- [ ] Existe un filtro global de excepciones (`GlobalExceptionFilter`) registrado en `main.ts` con `app.useGlobalFilters()`.
- [ ] El filtro global produce respuestas con esta estructura exacta para **todos** los errores (incluyendo errores de validación de `ValidationPipe`):
  ```json
  {
    "type": "https://nexos.com/errors/<slug>",
    "title": "Descripción breve",
    "status": 400,
    "detail": "Explicación para el desarrollador",
    "code": "<SLUG_EN_MAYUSCULAS>"
  }
  ```
- [ ] Los errores de validación del `ValidationPipe` también pasan por el filtro global y devuelven `status: 400` con `slug: validation-error` y el detalle de los campos inválidos en `detail`.

---

## Checklist de Límites de Tamaño de Código

- [ ] Ningún `*Service` supera 200 líneas. Si lo supera, la lógica está dividida en Sub-Services o Helpers especializados con responsabilidad única (SRP). El Service principal solo orquesta.
- [ ] Ningún `*Controller` supera 100 líneas. Los controllers solo delegan al Service — no contienen lógica de negocio.
- [ ] Ninguna función o método supera 30 líneas. Las funciones largas son candidatas a extracción.
- [ ] Si un Service fue dividido en Sub-Services, el Sub-Service es inyectable (`@Injectable()`) y privado al módulo. No se exporta a otros módulos — solo el Service padre se exporta.

---

## Checklist de TypeScript Strict

- [ ] El archivo `tsconfig.json` tiene `"strict": true`. Nunca eliminarlo para "que compile más rápido".
- [ ] Ningún archivo en `src/**` contiene la palabra `any` como tipo (incluyendo castings `as any`). Verificar con `grep -rn ": any" src/` y `grep -rn "as any" src/`.
- [ ] Cuando se necesita manejar un tipo desconocido, se usa `unknown` con un type guard explícito. Ejemplo: `if (typeof err === 'object' && err !== null && 'message' in err)`.
- [ ] Todos los métodos públicos de los Services y Controllers tienen tipos de retorno explícitos. No se depende de inferencia en la interfaz pública.

---

## Checklist de Seguridad HTTP

- [ ] `helmet()` está aplicado en `main.ts` antes de cualquier otro middleware.
- [ ] `ThrottlerModule` está configurado en `AppModule` con límites por defecto (ej. 60 requests/minuto por IP). Los endpoints financieros tienen un `ThrottlerGuard` más restrictivo.
- [ ] Los endpoints públicos (sin `SupabaseGuard`) tienen rate limiting más agresivo que los endpoints autenticados.
- [ ] El `ValidationPipe` global tiene `whitelist: true` y `forbidNonWhitelisted: true`. Esto previene que propiedades extras del body lleguen a los Services.

---

## Checklist de Testing

Ver `docs/reference/testing-guidelines.md` para el detalle completo.

- [ ] Ningún archivo `*.spec.ts` o `*.e2e-spec.ts` construye objetos de Prisma con llaves literales. Todos los objetos de entidad se generan con factories de `@test/factories`.
- [ ] Ningún test unitario llama a servicios externos reales (S3, pasarela de pagos, Expo). Todos usan los mocks de `@test/mocks`.
- [ ] Todo test que verifique un plazo temporal (48hs Escrow, deadline de Segunda Oportunidad, TTL de Redis) llama a `vi.useFakeTimers()` y `vi.setSystemTime(FIXED_NOW)` en su `beforeEach`. El `afterEach` llama a `vi.useRealTimers()`.
- [ ] Existe al menos un archivo `__tests__/<nombre>.service.spec.ts` por cada Service implementado.
- [ ] La cobertura global del backend cumple **>= 95%** en `lines`, `branches`, `functions` y `statements`.
- [ ] `npm run test:cov:strict` pasa sin errores de umbral (95% global definido en `src/config/vitest.config.ts`).

---

## Checklist de Documentación Swagger

**Referencia:** `docs/reference/coding-guidelines.md` Sección 11 · `docs/reference/api-testing.md`

- [ ] El endpoint es visible en `http://localhost:3000/api/docs` (servidor corriendo con `NODE_ENV=development`).
- [ ] El Controller tiene `@ApiTags('nombre-del-modulo')` en la clase.
- [ ] Los endpoints protegidos tienen `@ApiBearerAuth('supabase-jwt')` en la clase o en cada método.
- [ ] Cada método del Controller tiene `@ApiOperation({ summary: '...' })` con descripción concisa.
- [ ] Los métodos tienen `@ApiResponse()` para al menos: el caso de éxito (`200`/`201`) y el error principal (`400`/`401`/`404`).
- [ ] Los errores de `@ApiResponse()` usan `schema: { $ref: '#/components/schemas/ProblemDetail' }` — no strings genéricos.
- [ ] Todos los DTOs de entrada tienen `@ApiProperty()` en cada propiedad con `example` real (no `'string'` o `0`).
- [ ] Los campos opcionales del DTO usan `@ApiPropertyOptional()`.
- [ ] Los Response DTOs son clases separadas de los DTOs de entrada — ninguna entidad Prisma se retorna directamente como response.
- [ ] El JSON de `http://localhost:3000/api/docs-json` fue importado a Postman y el request está guardado en la carpeta correcta de la colección.
- [ ] El request de Postman tiene al menos un test `pm.test()`.

---

## Checklist de Definition of Done (DoD)

Este es el checklist final antes de solicitar revisión de PR. Un módulo no está **terminado** si algún ítem está sin marcar.

### Especificación y Diseño
- [ ] Spec del módulo existe en `.harness/specs/<nombre>-module.md` y fue leída antes de escribir código.
- [ ] El módulo está registrado en `.harness/INDEX.md`.
- [ ] La configuración del módulo está en `src/config/<nombre>.config.ts` con `registerAs()`.

### Código
- [ ] Path Aliases usados en todos los imports inter-módulo (`@modules/*`, `@common/*`, `@config/*`).
- [ ] Ningún Service supera 200 líneas. Ningún Controller supera 100 líneas.
- [ ] Cero usos de `any` — todos los tipos son explícitos o `unknown`.
- [ ] Cero accesos directos a `process.env` en `src/modules/**`.

### Testing
- [ ] Tests unitarios con Vitest pasando (`npm run test`).
- [ ] Cobertura del módulo no degrada el umbral global de calidad (`npm run test:cov:strict`).
- [ ] Ningún PR se acepta si baja de 95% en cualquier métrica global.
- [ ] Lógica temporal testeada con `vi.useFakeTimers()` + `vi.setSystemTime()`.
- [ ] Factories de `@test/factories` usadas — prohibidos objetos literales de Prisma en tests.

### API y Documentación
- [ ] Endpoint visible en `/api/docs` con `@ApiTags`, `@ApiOperation` y `@ApiResponse`.
- [ ] Todos los DTOs de entrada tienen `@ApiProperty()` con `example` real.
- [ ] Request guardado en la colección Postman con al menos un `pm.test()`.
- [ ] Errores devuelven RFC 7807 con `code` en `SCREAMING_SNAKE_CASE`.

### Auditoría y Seguridad
- [ ] Toda mutación financiera o de roles genera una entrada en `AuditLog`.
- [ ] Toda respuesta de error tiene un `slug` definido en `docs/reference/api-standards.md`.

---

## Test de Herramientas (Ejecutar antes de cada PR)

```bash
# Desde la raíz del proyecto nexos-backend:

# 1. Verificar cero errores de TypeScript
npx tsc --noEmit
# Resultado esperado: sin output (exit code 0)

# 2. Verificar cero errores de ESLint
npx eslint "src/**/*.ts"
# Resultado esperado: sin errores. Warnings son aceptables pero deben revisarse.

# 3. Verificar que no hay 'any' en el código fuente
grep -rn ": any\|as any" src/ --include="*.ts"
# Resultado esperado: sin output

# 4. Verificar que no hay process.env directo en módulos
grep -rn "process\.env" src/modules/ --include="*.ts"
# Resultado esperado: sin output

# 5. Verificar que todos los DateTime tienen @db.Timestamptz en el schema
grep -n "DateTime" prisma/schema.prisma | grep -v "Timestamptz" | grep -v "//"
# Resultado esperado: sin output (solo los comentarios deberían quedar)

# 6. Verificar que los tests unitarios pasan (sin Docker)
npm run test
# Resultado esperado: todos los tests en verde, exit code 0

# 7. Verificar cobertura mínima
npm run test:cov:strict
# Resultado esperado: sin mensajes de "threshold not met" (95% global)

# 8. Verificar quality gate completo
npm run quality:check
# Resultado esperado: TypeScript + ESLint + coverage 95 + e2e en verde
# 9. Verificar que la documentación Swagger está disponible
npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/docs-json | grep -q '"openapi"'
echo "Swagger OK: $?"
# Resultado esperado: "Swagger OK: 0"
```
