# Rules: Docs-First (Doctrina de Cambios)
**Scope:** Todo el repositorio. Aplica a cualquier agente humano o IA que modifique código, schema, infraestructura o documentación.
**Vigencia:** Permanente desde 2026-05-12.
**Referencias:** [AGENTS.md](../../AGENTS.md), [.cursorrules](../../.cursorrules), [Harness Index](../INDEX.md).

---

## 1. Principio

> Antes de **agregar, modificar o eliminar** un módulo, contrato, modelo de datos, infraestructura o cualquier cosa documentada en el repo, se actualiza primero la documentación. La doc va siempre adelante del código.

La consecuencia práctica es que el spec/eval/rule **describe la intención** y el código **la implementa**. Si ambos divergen, la fuente de verdad es la doc — y eso obliga a corregir el código, no al revés.

---

## 2. Matriz de obligaciones

| Acción | Documentación que se actualiza ANTES de tocar código |
|--------|------------------------------------------------------|
| **Agregar un módulo nuevo** | Crear `.harness/specs/<mod>-module.md` + `.harness/evals/<mod>-module-eval.md`. Agregar filas en [INDEX.md](../INDEX.md) y [SESSION_STATE.md](../SESSION_STATE.md). Actualizar `docs/explanation/architecture.md` si suma una pieza nueva al diagrama. |
| **Modificar un módulo documentado** | Actualizar la(s) sección(es) afectadas en su spec/eval/rules (state machine, endpoints, DTO, invariantes, validaciones). Reflejar el cambio en `SESSION_STATE.md` si altera el estado funcional declarado. |
| **Eliminar / deprecar un módulo** | Marcar deprecation explícito en spec/eval (encabezado **DEPRECATED**), actualizar `SESSION_STATE.md` y planificar la remoción. Solo después se borra el código. |
| **Cambiar infra transversal** (Prisma schema, JWT/Auth, Storage, Money, RFC 7807, Redis, BullMQ) | Actualizar la `rule` correspondiente en `.harness/rules/`. Si no existe rule para el tema, crearla. |
| **Agregar endpoint nuevo a un módulo existente** | Incluirlo en la sección "Controladores y Endpoints" del spec del módulo. Si requiere nuevo slug RFC 7807, agregarlo en [api-standards.md](../../docs/reference/api-standards.md). |
| **Cambiar política de seguridad o PII** | Actualizar [docs/reference/security-roles.md](../../docs/reference/security-roles.md) y referenciar desde la spec del módulo afectado. |

---

## 3. Excepciones (NO aplica Docs-First)

Estas situaciones pueden ir directo a código sin paso documental previo:

- **Refactors internos** sin cambio de contrato externo, ni de invariantes documentadas, ni de comportamiento observable (ej. extraer una función privada, renombrar una variable local).
- **Fixes de typo, formato o estilo** que no alteran semántica.
- **Cambios puramente de tests** que documentan más fielmente lo que ya está en la doc (no introducen comportamiento nuevo).
- **Dependencias menores** (bump de patch version sin breaking change documentado).
- **Mejoras de logs o tracing** que no cambian el contrato del endpoint ni los slugs de error.

Si hay duda razonable sobre si una excepción aplica, la regla por defecto es **actualizar la doc primero**.

---

## 4. Orden de commits

Para que el cambio sea revisable de forma independiente:

1. **Primero**: commit `docs(<scope>): <cambio en spec/eval/rules>` o `docs(harness): ...`.
2. **Después** (separado): commit `feat(<scope>): ...` / `refactor(...)` / `fix(...)` con el código que **implementa** lo documentado.

El primer commit puede ser rechazado en review sin descartar trabajo de implementación. Si los dos van juntos, un rechazo del spec obliga a rehacer todo.

Conventional Commits sigue siendo obligatorio (ver [coding-guidelines](../../docs/reference/coding-guidelines.md)). Los scopes habituales son `harness`, `portfolio`, `auth`, `storage`, etc.

---

## 5. Checklist de PR

Todo PR debe poder responder afirmativamente a estas preguntas. Si alguna queda en NO sin justificación en la descripción del PR, el revisor puede rechazar.

- [ ] ¿Actualicé la spec/eval/rules afectada **antes** de tocar código?
- [ ] ¿Hay un commit `docs(...)` previo al commit de código en este PR?
- [ ] ¿`INDEX.md` y `SESSION_STATE.md` reflejan el estado real tras este cambio?
- [ ] Si el cambio toca un endpoint público o un slug RFC 7807, ¿está reflejado en [api-standards.md](../../docs/reference/api-standards.md)?
- [ ] Si el cambio toca PII, RBAC o KYC, ¿está reflejado en [security-roles.md](../../docs/reference/security-roles.md)?
- [ ] Si el cambio toca infra transversal, ¿hay una `rule` en `.harness/rules/` que lo describa?

---

## 6. Cómo se enforza

- **Hoy (manual)**: convención de PR review. Los revisores rechazan PRs sin commit `docs(...)` previo cuando aplica.
- **Próximos pasos (planificado, no implementado)**: hook de CI que rechace PRs cuyo diff toque `src/modules/<mod>/` sin diff correspondiente en `.harness/specs/<mod>-module.md`. Mencionado como TODO operativo, fuera del scope de la regla actual.

---

## 7. Anti-patrones a evitar

- "Lo documento después" — el "después" nunca llega y la doc se desincroniza.
- "El código es la documentación" — el código describe el **cómo**, no el **por qué** ni los **invariantes** que tienen que mantenerse a futuro.
- "Es un cambio chico, no hace falta" — los cambios chicos no documentados se acumulan y producen la deriva semántica que esta regla previene.
- Mezclar `docs(...)` y `feat(...)` en el mismo commit — anula la revisión independiente del contrato.

---

## 8. Por qué existe esta regla

Sin Docs-First, el harness se vuelve obsoleto en pocas semanas. Cuando un agente nuevo o un dev que vuelve después de tiempo lee `.harness/specs/foo-module.md` y encuentra que la realidad del código no coincide, **pierde toda la utilidad del harness** y empieza a tomar decisiones desde cero. La doctrina mantiene el harness vivo: cuesta más por cambio, pero rinde a lo largo del tiempo del proyecto.
