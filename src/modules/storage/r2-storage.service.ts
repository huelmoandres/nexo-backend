import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildProblem } from '@common/errors/problem.factory';
import { storageConfig } from '@config/storage.config';
import type {
  IStorageService,
  PresignedPutResult,
} from './interfaces/storage.service.interface';
import { assertKeyBelongsToUser } from './storage-paths';

/**
 * Implementación real de almacenamiento sobre Cloudflare R2 (S3-compatible).
 *
 * Esta clase implementa el contrato `IStorageService` para mantener desacoplado
 * el dominio de usuarios respecto del proveedor concreto de object storage.
 */
@Injectable()
export class R2StorageService implements IStorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client;
  private readonly configured: boolean;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.configured =
      !!config.r2Endpoint &&
      !!config.r2AccessKeyId &&
      !!config.r2SecretAccessKey;

    this.client = new S3Client({
      region: 'auto',
      endpoint: config.r2Endpoint || undefined,
      credentials: this.configured
        ? {
            accessKeyId: config.r2AccessKeyId,
            secretAccessKey: config.r2SecretAccessKey,
          }
        : undefined,
    });
  }

  /**
   * Valida que las credenciales/endpoint requeridos estén disponibles antes de
   * ejecutar llamadas remotas al proveedor de storage.
   *
   * @throws ServiceUnavailableException Si falta configuración crítica de R2.
   */
  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'R2 Storage no está configurado. Verifica R2_ENDPOINT, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.',
      );
    }
  }

  /**
   * Genera una URL prefirmada para subir un archivo a R2 mediante `PUT`.
   *
   * Política de seguridad: en la implementación real exigimos `contentType`
   * explícito para evitar subidas ambiguas y mantener trazabilidad del MIME.
   *
   * @param input.key Ruta lógica del objeto dentro del bucket.
   * @param input.bucket Bucket de destino; si se omite usa `r2BucketKyc`.
   * @param input.contentType MIME type del archivo a subir.
   * @returns URL prefirmada y la misma `key` persistible en base de datos.
   * @throws ServiceUnavailableException Si R2 no está configurado.
   * @throws ServiceUnavailableException Si `contentType` no fue provisto.
   */
  async generatePresignedPutUrl(input: {
    key: string;
    bucket?: string;
    contentType?: string;
  }): Promise<PresignedPutResult> {
    this.assertConfigured();
    if (!input.contentType || input.contentType.trim() === '') {
      throw new ServiceUnavailableException(
        'R2 Storage requiere contentType para generar presigned PUT URL.',
      );
    }
    const bucket = input.bucket ?? this.config.r2BucketKyc;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.config.presignedUrlTtlSeconds,
    });
    return { key: input.key, uploadUrl };
  }

  /**
   * Genera una URL prefirmada de descarga (`GET`) para un objeto existente.
   *
   * @param key Identificador del objeto.
   * @param bucket Bucket origen; si se omite usa `r2BucketKyc`.
   * @returns URL temporal firmada para lectura.
   * @throws ServiceUnavailableException Si R2 no está configurado.
   */
  async generatePresignedGetUrl(key: string, bucket?: string): Promise<string> {
    this.assertConfigured();
    const b = bucket ?? this.config.r2BucketKyc;
    const command = new GetObjectCommand({ Bucket: b, Key: key });
    return getSignedUrl(this.client, command, {
      expiresIn: this.config.presignedUrlTtlSeconds,
    });
  }

  /**
   * Verifica que un objeto existe en el bucket usando `HeadObject`.
   *
   * Usado por el flujo de publicación del portfolio para confirmar que todas
   * las fotos fueron subidas antes de marcar el item como PUBLISHED.
   *
   * @param key Identificador del objeto.
   * @param bucket Bucket origen; si se omite usa `r2BucketKyc`.
   * @throws NotFoundException Con `code: STORAGE_OBJECT_NOT_FOUND` si el objeto no existe (404).
   * @throws ServiceUnavailableException Si R2 no está configurado o devuelve 5xx.
   */
  async assertObjectExists(key: string, bucket?: string): Promise<void> {
    this.assertConfigured();
    const b = bucket ?? this.config.r2BucketKyc;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: b, Key: key }));
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'NotFound' || code === '404' || code === 'NoSuchKey') {
        throw new NotFoundException(
          buildProblem(
            'STORAGE_OBJECT_NOT_FOUND',
            `El objeto no existe en storage: ${key}`,
          ),
        );
      }
      throw new ServiceUnavailableException(
        `Storage HEAD check failed for key: ${key}`,
      );
    }
  }

  /**
   * Elimina un objeto del bucket validando que el `key` pertenezca al usuario.
   *
   * Delega la validación de ownership a `assertKeyBelongsToUser` de
   * `storage-paths.ts` (única fuente de verdad para la convención
   * `users/<userId>/`).
   *
   * @param key Objeto a eliminar. Debe empezar con `users/<userId>/`.
   * @param userId ID del usuario autenticado.
   * @param bucket Bucket objetivo; si se omite usa `r2BucketKyc`.
   * @throws ForbiddenException Si el key no pertenece al userId.
   * @throws ServiceUnavailableException Si R2 no está configurado.
   */
  async deleteObjectForUser(
    key: string,
    userId: string,
    bucket?: string,
  ): Promise<void> {
    try {
      assertKeyBelongsToUser(key, userId);
    } catch (err) {
      this.logger.warn({
        op: 'storage.delete.forbidden',
        userId,
        keyPrefix: key.slice(0, 40),
      });
      throw err;
    }
    this.assertConfigured();
    const b = bucket ?? this.config.r2BucketKyc;
    await this.client.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
  }

  /**
   * Elimina un objeto del bucket sin validación de ownership.
   * Reservado para operaciones internas de sistema (BullMQ workers, cleanup).
   *
   * @security-critical No exponer en endpoints HTTP de usuario.
   *
   * @param key Objeto a eliminar.
   * @param bucket Bucket objetivo; si se omite usa `r2BucketKyc`.
   * @param reason Motivo del borrado (obligatorio para auditoría).
   * @throws ServiceUnavailableException Si R2 no está configurado.
   */
  async deleteObjectAsSystem(
    key: string,
    bucket: string | undefined,
    reason: string,
  ): Promise<void> {
    this.assertConfigured();
    this.logger.log({
      op: 'storage.delete.system',
      actor: 'system',
      reason,
      keyPrefix: key.slice(0, 40),
    });
    const b = bucket ?? this.config.r2BucketKyc;
    await this.client.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
  }

  /**
   * Elimina un objeto del bucket indicado.
   *
   * @deprecated Usar `deleteObjectForUser` o `deleteObjectAsSystem` según contexto.
   * @param key Identificador del objeto.
   * @param bucket Bucket objetivo; si se omite usa `r2BucketKyc`.
   * @throws ServiceUnavailableException Si R2 no está configurado.
   */
  async deleteObject(key: string, bucket?: string): Promise<void> {
    this.assertConfigured();
    const b = bucket ?? this.config.r2BucketKyc;
    await this.client.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
  }

  /**
   * Verifica conectividad/autorización al bucket con una operación liviana.
   *
   * Usado por `StorageCheck` en el diagnóstico de startup/readiness.
   *
   * @param bucket Bucket a validar; si se omite usa `r2BucketKyc`.
   * @throws ServiceUnavailableException Si R2 no está configurado.
   */
  async headBucket(bucket?: string): Promise<void> {
    this.assertConfigured();
    const b = bucket ?? this.config.r2BucketKyc;
    await this.client.send(new HeadBucketCommand({ Bucket: b }));
  }
}
