# Rules: API & Comunicación HTTP
**Scope:** Aplica a todo archivo dentro de `src/modules/*/` que exponga endpoints HTTP.
**Referencia:** `docs/reference/api-standards.md` para la lista completa de slugs y ejemplos.

---

## REGLA 1: Errores siempre con RFC 7807

Todo error que salga de la API debe usar el Filtro de Excepciones Global. Está **prohibido** responder con estructuras de error propias o usar `throw new Error('mensaje')` en los controllers.

**Correcto:**
```typescript
throw new NotFoundException({
  type: 'https://nexos.com/errors/user-not-found',
  title: 'Usuario no encontrado',
  status: 404,
  detail: `No existe un usuario con el ID ${userId}`,
  code: 'USER_NOT_FOUND',
});
```

**Incorrecto:**
```typescript
throw new Error('User not found'); // No sigue RFC 7807
res.status(404).json({ error: 'not found' }); // Formato propio
```

---

## REGLA 2: Slugs de error definidos, no inventados

Los slugs (`code`) deben estar definidos en `docs/reference/api-standards.md` antes de usarse en código. Si necesitas un slug nuevo, agrégalo al documento primero.

Están **prohibidos** los códigos numéricos internos como `{ code: 4001 }` o mensajes de error libres como `{ message: "algo salió mal" }`.

**Queda terminantemente prohibido inventar o redefinir slugs de error fuera de `docs/reference/api-standards.md`.** Las specs en `/.harness/specs/`, los evals y el código solo **consumen** los slugs ya listados allí; cualquier variante alternativa (nombres distintos para el mismo caso) invalida el PR.

---

## REGLA 3: Logging con Pino, prohibido `console.log`

Ningún archivo dentro de `src/` puede usar `console.log`, `console.error` o `console.warn`. Usar siempre el `Logger` de NestJS que está configurado sobre Pino:

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async findOne(id: string) {
    this.logger.log(`Buscando usuario ${id}`);
    this.logger.warn(`Usuario ${id} sin KYC, limitando acceso`);
    this.logger.error(`Fallo crítico al conectar con Prisma`);
  }
}
```

---

## REGLA 4: Paginación obligatoria en listas

Cualquier endpoint que devuelva un array debe aceptar `page` y `limit` como query params y devolver el objeto `meta`. Usar el `PaginationQueryDto` del directorio `/src/common/dto/`.

```typescript
@Get()
findAll(@Query() pagination: PaginationQueryDto) {
  return this.service.findAll(pagination);
}
```

La respuesta debe incluir:
```json
{
  "data": [...],
  "meta": {
    "totalItems": 100,
    "itemCount": 10,
    "itemsPerPage": 10,
    "totalPages": 10,
    "currentPage": 1
  }
}
```

---

## REGLA 5: DTOs validados en todos los endpoints de escritura

Ningún dato del body llega al Service sin pasar por un DTO decorado con `class-validator`. El `ValidationPipe` global se encarga de rechazar automáticamente las peticiones mal formadas.
