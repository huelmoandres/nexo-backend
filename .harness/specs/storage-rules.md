# SPECS: Storage & File Management
**Dominio:** `/src/modules/storage` (servicio compartido sin endpoints propios)
**Referencia cruzada:** `docs/reference/security-roles.md` (protección de datos KYC), `docs/explanation/architecture.md`.

## 1. Contexto del Módulo
El `StorageService` es un servicio inyectable que centraliza **toda** la interacción con el almacenamiento de archivos (Cloudflare R2, compatible con AWS S3). Ningún otro módulo debe importar el SDK de S3 directamente; todos deben usar este servicio como única capa de abstracción.

Este patrón garantiza que si HRProgrammers decide cambiar de proveedor de almacenamiento (de Cloudflare R2 a AWS S3, o a otro), solo se modifica este módulo.

---

## 2. Infraestructura

- **Proveedor:** Cloudflare R2 (compatibilidad total con AWS S3 API).
- **SDK:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- **Autenticación del SDK:** Credenciales cargadas desde `src/config/storage.config.ts` usando `@nestjs/config`. Nunca hardcodeadas.

---

## 3. Clasificación de Archivos por Privacidad

| Tipo de archivo | Bucket | Modo de acceso | TTL de URL firmada |
|---|---|---|---|
| Foto de perfil de usuario | `nexos-public` | URL pública permanente | N/A |
| Foto de portfolio del profesional | `nexos-public` | URL pública permanente | N/A |
| Foto Before/After de trabajo | `nexos-evidencias` | URL firmada temporal | 15 minutos |
| Documento KYC (cédula frontal/dorso, selfie) | `nexos-kyc` | URL firmada temporal | 15 minutos |
| Recibo de materiales | `nexos-evidencias` | URL firmada temporal | 15 minutos |
| Exports internos (reportes de admin) | `nexos-internal` | URL firmada temporal | 5 minutos |

### Regla Absoluta:
> El backend **NUNCA** devuelve una URL directa de R2/S3 (`https://<bucket>.r2.cloudflarestorage.com/<key>`) para contenido privado. Toda URL privada pasa por `generatePresignedGetUrl()` antes de ser devuelta al cliente. Las fotos de perfil y portfolio sí usan URL pública del bucket público, cacheable en CDN.

---

## 4. Naming Convention de Archivos

El `key` (ruta dentro del bucket) sigue este formato para garantizar unicidad y organización:

```
<userId>/<tipo>/<uuid>.<ext>
```

Para portfolio, el formato anida el `itemId` para soportar el cleanup masivo por prefijo:

```
<userId>/portfolio/<itemId>/<uuid>.<ext>
```

Ejemplos:
```
usr_abc123/kyc/550e8400-e29b-41d4-a716-446655440000.jpg
usr_abc123/evidence/before/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg
usr_abc123/receipts/a81bc81b-dead-4e5d-abff-90865d1e13b1.pdf
usr_abc123/portfolio/8f14e45f-ceea-467a-9575-d0e0f2c1d4a1/d6a73b0a-22e8-4a8d-8a3f-9f0d9c2a6e1f.jpg
```

El cliente nunca genera el `key`. Lo genera el backend en el `StorageService` antes de emitir la URL de pre-signed PUT.

### Regex de validación del `key` (consumido por módulos)

Cualquier módulo que persista un `key` (p. ej. portfolio al recibir el `fileKey` del cliente) debe validarlo contra una regex que matchee el patrón canónico **y** que el segmento `usr_<id>` coincida con `req.user.sub`. Ejemplo para portfolio:

```
^usr_[A-Za-z0-9_-]+/portfolio/[A-Za-z0-9-]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$
```

Si no matchea: `400 VALIDATION_ERROR`. Si el `usr_<id>` no es del autenticado: `403 STORAGE_FORBIDDEN_KEY`.

---

## 5. Interfaz del StorageService

```typescript
@Injectable()
export class StorageService {
  /**
   * Genera una URL prefirmada para subida (PUT) de un nuevo archivo.
   * La app móvil usa esta URL para subir el archivo directamente a R2,
   * sin pasar el binario por el backend de NestJS.
   * @param userId - ID del usuario propietario del archivo
   * @param fileType - Tipo de archivo ('kyc' | 'evidence' | 'receipt' | 'profile')
   * @param ext - Extensión del archivo (ej. 'jpg', 'pdf')
   * @returns { uploadUrl: string, key: string } - URL de subida + key para referencia
   */
  async generatePresignedPutUrl(
    userId: string,
    fileType: StorageFileType,
    ext: string,
  ): Promise<{ uploadUrl: string; key: string }>;

  /**
   * Genera una URL prefirmada para descarga (GET) de un archivo privado.
   * Expira en 15 minutos (900 segundos).
   * @param key - Clave del archivo en el bucket
   * @param bucket - Nombre del bucket
   */
  async generatePresignedGetUrl(key: string, bucket: StorageBucket): Promise<string>;

  /**
   * Elimina un archivo del bucket. Usar solo para limpieza de KYC rechazado
   * o cuando el usuario borra su cuenta.
   */
  async deleteObject(key: string, bucket: StorageBucket): Promise<void>;
}
```

---

## 6. Flujo de Subida de Archivos (Upload Flow)

La app móvil **nunca** envía el binario al backend de NestJS. El flujo es:

```
App Móvil                     NestJS (StorageService)           Cloudflare R2
    │                                   │                              │
    │── GET /storage/upload-url ────────▶│                              │
    │   { fileType: 'kyc', ext: 'jpg' }  │                              │
    │                                   │── GeneratePutPresignedUrl ──▶│
    │                                   │◀── { uploadUrl, key } ───────│
    │◀── { uploadUrl, key } ────────────│                              │
    │                                   │                              │
    │── PUT <uploadUrl> (binario) ───────────────────────────────────▶│
    │◀── 200 OK ──────────────────────────────────────────────────────│
    │                                   │                              │
    │── POST /users/verification/kyc ──▶│                              │
    │   { documentFrontUrl: key }        │── Guarda key en Postgres ──▶│
```

El frontend envía el `key` (no la URL) al backend para persistir la referencia. El backend genera la URL firmada solo cuando necesita devolverla al cliente para visualización.

---

## 7. Endpoint: Obtener URL de Subida

- **Ruta:** `GET /storage/upload-url`
- **Protección:** `SupabaseGuard`
- **Query Params (`GetUploadUrlDto`):**
  - `fileType`: `@IsEnum(['kyc', 'evidence_before', 'evidence_after', 'receipt', 'profile'])`, obligatorio.
  - `ext`: `@IsString()`, `@Matches(/^[a-zA-Z]{2,4}$/)`, obligatorio.
- **Lógica:** Genera el `key` con la naming convention, devuelve la URL prefirmada PUT y el `key`.
- **Respuesta:** `{ uploadUrl: string, key: string, expiresInSeconds: 300 }`.

Tipos permitidos: `kyc | evidence_before | evidence_after | receipt | profile | portfolio`.

---

## 8. Configuración (src/config/storage.config.ts)

```typescript
export default registerAs('storage', () => ({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  buckets: {
    public: process.env.S3_BUCKET_PUBLIC || 'nexos-public',
    evidencias: process.env.S3_BUCKET_EVIDENCIAS || 'nexos-evidencias',
    kyc: process.env.S3_BUCKET_KYC || 'nexos-kyc',
    internal: process.env.S3_BUCKET_INTERNAL || 'nexos-internal',
  },
  presignedGetTtlSeconds: 900,   // 15 minutos
  presignedPutTtlSeconds: 300,   // 5 minutos para subir
}));
```

---

## 9. Reglas de Código para el Agente
- **NUNCA** importar `@aws-sdk/client-s3` fuera del `StorageModule`. Todos los demás módulos inyectan `StorageService`.
- **NUNCA** devolver una URL del bucket directa para contenido privado. Siempre pasar por `generatePresignedGetUrl()`. Las fotos de perfil y portfolio pueden devolver URL pública del bucket público.
- Los nombres de buckets son configuración, no strings hardcodeados en el código.
- El binario del archivo **nunca** llega al backend de NestJS. El backend solo maneja `key` strings y genera URLs prefirmadas.

---

## 10. Ownership de Paths (Defense-in-Depth Transversal)

### 10.1 Principio

Toda operación destructiva sobre objetos del bucket (`deleteObject`, `deleteObjects`, list-y-delete masivo) que parte de un usuario autenticado **DEBE** ser interceptada por el `StorageService` y rechazada si el `key` no pertenece al usuario. Concretamente:

- Si el `key` no empieza con `usr_<userId>/` → rechazar con `403 STORAGE_FORBIDDEN_KEY` y log estructurado en Pino con `op: 'storage.delete.forbidden'`, `userId`, `key` truncado.
- Si el `key` no matchea el patrón canónico (regex de la sección 4) → rechazar con `400 VALIDATION_ERROR`.
- Si el `key` matchea pero el `usr_<id>` no es el del autenticado → mismo `403 STORAGE_FORBIDDEN_KEY`.

Este check aplica a `deleteObject`, `deleteObjects`, y a cualquier wrapper futuro de listado-y-delete masivo (p. ej. el `portfolio-cleanup` worker que borra por prefijo).

### 10.2 Excepción: identidad de sistema

Las operaciones internas que corren con identidad de sistema (cleanup de soft-delete agendado, exports de admin, retención automatizada) **pueden** bypassear el check, pero deben:

1. Invocarse desde un método dedicado del `StorageService` (`deleteObjectAsSystem(...)`) que es **distinto** del path normal.
2. Loguear un evento de audit en Pino con `op: 'storage.delete.system'`, `actor: 'system'`, `reason`, `key`.
3. Estar limitadas a invocarse desde processors BullMQ o handlers admin, nunca desde código HTTP que recibe `req.user`.

### 10.3 Emisión de URLs prefirmadas PUT

El `key` lo genera siempre el backend a partir del `userId` del JWT. **NUNCA** se acepta un `key` enviado por el cliente al pedir una URL PUT (el cliente solo manda `fileType` y `ext`). Esto ya es la práctica desde la sección 4; queda explícito acá como regla de ownership.

### 10.4 Persistencia de `fileKey` recibido del cliente

Cuando un módulo recibe un `fileKey` ya subido (porque el cliente completó el PUT y ahora persiste la referencia), el módulo **DEBE**:

1. Validar regex contra el patrón canónico del tipo de archivo.
2. Validar que el segmento `usr_<id>` coincide con `req.user.sub`.
3. Validar que el `fileKey` no esté ya persistido en otra fila (si el dominio lo requiere; p. ej. `PortfolioPhoto.fileKey` es `@unique`).

Si alguna validación falla, `400 VALIDATION_ERROR` o `403 STORAGE_FORBIDDEN_KEY` según el caso.

### 10.5 Tests obligatorios

- Test unitario de `StorageService.deleteObject` que verifica el rechazo con `key` foráneo.
- Test e2e que un endpoint que persiste `fileKey` (p. ej. portfolio) rechaza un `fileKey` foráneo en el body.
- Test de integración del `portfolio-cleanup` que solo borra objetos cuyo prefijo es del profesional dueño del item.
