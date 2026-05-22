# Cómo Agregar un Nuevo Módulo NestJS
**Tipo:** How-to (orientado a tareas)
**Audiencia:** Desarrollador que ya entiende el proyecto y necesita agregar un nuevo dominio.
**Asume:** Que el entorno ya está corriendo (ver `docs/tutorials/getting-started.md`).

**Checklist de contexto (antes de codear):** leer [AGENTS.md](../../AGENTS.md), el [.harness/INDEX.md](../../.harness/INDEX.md), [security-roles.md](../reference/security-roles.md) §6 y [plans-entitlements.md](../../.harness/specs/plans-entitlements.md) §7. Crear o actualizar `.harness/specs/<nombre>-module.md` con secciones **RBAC** y **Planes y entitlements** ([docs-first §9](../../.harness/rules/docs-first.md)) **antes** del primer commit de código.

---

## 1. Crear la carpeta y generar los archivos base

Reemplaza `<nombre>` con el nombre en minúsculas de tu dominio (ej. `payments`, `reviews`, `notifications`).

```bash
# Desde la raíz del proyecto
cd src/modules

nest generate module <nombre>
nest generate controller <nombre> --no-spec
nest generate service <nombre> --no-spec
```

Esto genera:

```
src/modules/<nombre>/
├── <nombre>.module.ts
├── <nombre>.controller.ts
└── <nombre>.service.ts
```

---

## 2. Crear la estructura de carpetas interna

```bash
mkdir -p src/modules/<nombre>/dto
mkdir -p src/modules/<nombre>/entities
mkdir -p src/modules/<nombre>/interfaces
```

---

## 3. Crear el primer DTO

Dentro de `src/modules/<nombre>/dto/`, crea el DTO de creación con validaciones:

```typescript
// src/modules/<nombre>/dto/create-<nombre>.dto.ts
import { IsString, IsEmail, MinLength } from 'class-validator';

export class Create<Nombre>Dto {
  @IsString()
  @MinLength(3)
  name: string;

  // Agrega los campos del dominio siguiendo coding-guidelines.md
}
```

---

## 4. Aplicar los Guards al Controller

Todo endpoint protegido necesita al menos el `SupabaseAuthGuard`. Si requiere un rol específico, agregar además el `RolesGuard`:

```typescript
// src/modules/<nombre>/<nombre>.controller.ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { Roles } from '@modules/users/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('<nombre>s')
@UseGuards(SupabaseAuthGuard)
export class <Nombre>Controller {

  @Get('me')
  findOwn() { ... }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  create() { ... }
}
```

---

## 5. Registrar el módulo en `AppModule`

NestJS no detecta módulos automáticamente. Debes importarlo en `src/app.module.ts`:

```typescript
// src/app.module.ts
import { <Nombre>Module } from './modules/<nombre>/<nombre>.module';

@Module({
  imports: [
    // ... otros módulos
    <Nombre>Module,
  ],
})
export class AppModule {}
```

---

## 6. Crear la especificación en el Harness

Este paso es obligatorio según `.cursorrules`. Antes de escribir más código, crea el archivo de especificación:

```bash
touch .harness/specs/<nombre>-module.md
```

El archivo debe seguir la misma estructura que `auth-module.md` o `users-module.md`:
- Contexto del módulo
- Guards requeridos
- Endpoints con DTOs y lógica de negocio
- Excepciones esperadas (RFC 7807)
- Reglas de código para el agente

---

## 7. Agregar la entrada al INDEX

Actualiza `.harness/INDEX.md` para que el módulo sea visible en el mapa del harness:

```markdown
- [Módulo de <Nombre>](specs/<nombre>-module.md): Descripción breve.
```

---

## 8. Tests y Swagger

- Añade al menos **tests unitarios** mínimos del controller o service crítico (patrón Vitest del repo en `src/modules/*/__tests__/`).
- Si el módulo expone HTTP público o de producto, añade **`@ApiTags`** coherente y documenta DTOs para que el endpoint aparezca en Swagger (`NODE_ENV=development` → `/api/docs`).

---

## 9. Verificación final

Antes de hacer commit, verifica que:

```bash
# El servidor compila sin errores
npm run build

# No hay errores de TypeScript
npx tsc --noEmit

# Tests unitarios del módulo (ajusta la ruta al patrón de tu feature)
npm run test -- src/modules/<nombre>

# El módulo responde correctamente
curl -H "Authorization: Bearer <tu-jwt>" http://localhost:3000/api/<ruta-del-controller>
```
