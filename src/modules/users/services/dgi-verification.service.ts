import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  DgiVerificationStatus,
  Role,
  VerificationDocumentStatus,
  VerificationSubjectType,
} from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import {
  assertKeyBelongsToUser,
  buildVerificationDocKey,
  VERIFICATION_DOC_KEY_PATTERN,
} from '@modules/storage/storage-paths';
import type { PresignDocumentResponseDto } from '../dto/presign-document-response.dto';
import type { PresignVerificationDocumentDto } from '../dto/presign-verification-document.dto';
import type { VerifyRutDocumentDto } from '../dto/verify-rut-document.dto';
import type { VerificationStatusResponseDto } from '../dto/verification-status-response.dto';
import type { VerificationSubmitResponseDto } from '../dto/verification-submit-response.dto';
import type { AdminReviewVerificationDto } from '../dto/admin-review-verification.dto';
import type { PendingVerificationItemDto } from '../dto/pending-verification-item.dto';
import { UsersRepository } from '../users.repository';
import { DGI_VERIFY_JOB, DGI_VERIFY_QUEUE } from '../users-dgi.constants';
import type { DgiVerifyJobData } from '../queues/dgi-verify.processor';

@Injectable()
export class DgiVerificationService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    @Inject(usersConfig.KEY)
    private readonly usersCfg: ConfigType<typeof usersConfig>,
    @Inject(dgiConfig.KEY)
    private readonly dgiCfg: ConfigType<typeof dgiConfig>,
    @InjectQueue(DGI_VERIFY_QUEUE)
    private readonly verifyQueue: Queue<DgiVerifyJobData>,
  ) {}

  async presignVerificationDocument(
    supabaseUid: string,
    dto: PresignVerificationDocumentDto,
  ): Promise<PresignDocumentResponseDto> {
    const subject = await this.resolveSubjectForUser(
      supabaseUid,
      dto.subjectType,
    );
    this.assertSubjectHasRut(subject.rut);

    const ext = (dto.fileExtension ?? 'pdf').toLowerCase();
    if (ext !== 'pdf') {
      throw new BadRequestException(
        buildProblem(
          'DGI_VERIFICATION_INVALID_FILE',
          'Solo se aceptan documentos PDF para verificación DGI.',
        ),
      );
    }

    const key = buildVerificationDocKey(subject.userId, ext);
    const { uploadUrl } = await this.storage.generatePresignedPutUrl({
      key,
      bucket: this.usersCfg.kycBucket,
      contentType: 'application/pdf',
    });
    return { uploadUrl, key };
  }

  async submitVerification(
    supabaseUid: string,
    dto: VerifyRutDocumentDto,
  ): Promise<VerificationSubmitResponseDto> {
    const subject = await this.resolveSubjectForUser(
      supabaseUid,
      dto.subjectType,
    );
    this.assertSubjectHasRut(subject.rut);
    this.assertCanSubmit(subject.dgiVerificationStatus);

    if (!VERIFICATION_DOC_KEY_PATTERN.test(dto.storageKey)) {
      throw new BadRequestException(
        buildProblem(
          'DGI_VERIFICATION_INVALID_FILE',
          'La key del documento no cumple el formato de verificación.',
        ),
      );
    }
    assertKeyBelongsToUser(dto.storageKey, subject.userId);
    await this.storage.assertObjectExists(
      dto.storageKey,
      this.usersCfg.kycBucket,
    );

    await this.usersRepository.markDgiVerificationProcessing({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      storageKey: dto.storageKey,
      trustProfileId: subject.trustProfileId,
    });

    if (this.dgiCfg.queueEnabled) {
      await this.verifyQueue.add(
        DGI_VERIFY_JOB,
        {
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          storageKey: dto.storageKey,
          expectedRut: subject.rut,
          trustProfileId: subject.trustProfileId,
        },
        {
          jobId: `dgi-verify:${subject.subjectType}:${subject.subjectId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    }

    return {
      status: DgiVerificationStatus.PROCESSING,
      message:
        'El documento se está procesando. Consulta el estado en unos segundos.',
    };
  }

  async getVerificationStatus(
    supabaseUid: string,
    subjectType: VerificationSubjectType,
  ): Promise<VerificationStatusResponseDto> {
    const subject = await this.resolveSubjectForUser(supabaseUid, subjectType);
    return this.mapStatus(subject);
  }

  async listPendingForAdmin(): Promise<PendingVerificationItemDto[]> {
    const rows = await this.usersRepository.listPendingManualDgiVerifications();
    return rows.map((r) => ({
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      rut: r.rut,
      dgiRazonSocial: r.dgiRazonSocial,
      verificationDocKey: r.dgiVerificationDocKey,
      updatedAt: r.updatedAt,
    }));
  }

  async adminReview(
    subjectType: VerificationSubjectType,
    subjectId: string,
    dto: AdminReviewVerificationDto,
    reviewerUserId: string,
  ): Promise<VerificationStatusResponseDto> {
    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    if (!subject) {
      throw new NotFoundException(
        buildProblem(
          'DGI_VERIFICATION_SUBJECT_NOT_FOUND',
          'No se encontró el sujeto de verificación.',
        ),
      );
    }
    if (
      subject.dgiVerificationStatus !==
      DgiVerificationStatus.PENDING_MANUAL_REVIEW
    ) {
      throw new ConflictException(
        buildProblem(
          'DGI_VERIFICATION_REJECTED',
          'El sujeto no está pendiente de revisión manual.',
        ),
      );
    }

    if (dto.action === 'APPROVE') {
      await this.usersRepository.applyDgiVerificationResult({
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        trustProfileId: subject.trustProfileId,
        status: DgiVerificationStatus.VERIFIED_AUTO,
        method: 'ADMIN_MANUAL',
        dgiRazonSocial: subject.dgiRazonSocial ?? undefined,
        documentStatus: VerificationDocumentStatus.APPROVED,
        reviewedBy: reviewerUserId,
      });
      return {
        status: DgiVerificationStatus.VERIFIED_AUTO,
        method: 'ADMIN_MANUAL',
        dgiRazonSocial: subject.dgiRazonSocial,
        verifiedAt: new Date(),
      };
    }

    await this.usersRepository.applyDgiVerificationResult({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      trustProfileId: subject.trustProfileId,
      status: DgiVerificationStatus.REJECTED,
      method: 'ADMIN_MANUAL',
      documentStatus: VerificationDocumentStatus.REJECTED,
      rejectionReason: dto.reason ?? 'Rechazado por administrador',
      reviewedBy: reviewerUserId,
    });
    return {
      status: DgiVerificationStatus.REJECTED,
      method: 'ADMIN_MANUAL',
      verifiedAt: null,
    };
  }

  private async resolveSubjectForUser(
    supabaseUid: string,
    subjectType: VerificationSubjectType,
  ) {
    const subject = await this.usersRepository.findDgiVerificationSubject({
      supabaseUid,
      subjectType,
    });
    if (!subject) {
      throw new NotFoundException(
        buildProblem(
          'DGI_VERIFICATION_SUBJECT_NOT_FOUND',
          'No se encontró el sujeto de verificación para este usuario.',
        ),
      );
    }
    return subject;
  }

  private assertSubjectHasRut(rut: string | undefined): asserts rut is string {
    if (!rut) {
      throw new BadRequestException(
        buildProblem(
          'DGI_VERIFICATION_NO_RUT',
          'Debes registrar un RUT antes de verificar con constancia DGI.',
        ),
      );
    }
  }

  private assertCanSubmit(status: DgiVerificationStatus): void {
    if (status === DgiVerificationStatus.VERIFIED_AUTO) {
      throw new ConflictException(
        buildProblem(
          'DGI_VERIFICATION_ALREADY_VERIFIED',
          'El RUT ya fue verificado automáticamente.',
        ),
      );
    }
    if (status === DgiVerificationStatus.PROCESSING) {
      throw new ConflictException(
        buildProblem(
          'DGI_VERIFICATION_IN_PROGRESS',
          'Ya hay una verificación DGI en curso.',
        ),
      );
    }
  }

  private mapStatus(subject: {
    dgiVerificationStatus: DgiVerificationStatus;
    dgiRazonSocial: string | null;
    dgiVerificationMethod: string | null;
    dgiVerifiedAt: Date | null;
  }): VerificationStatusResponseDto {
    return {
      status: subject.dgiVerificationStatus,
      method: subject.dgiVerificationMethod,
      dgiRazonSocial: subject.dgiRazonSocial,
      verifiedAt: subject.dgiVerifiedAt,
    };
  }
}

/** Roles permitidos por tipo de sujeto (validación adicional en guard si hace falta). */
export function assertRoleForDgiSubject(
  role: Role,
  subjectType: VerificationSubjectType,
): void {
  if (
    subjectType === VerificationSubjectType.COMPANY &&
    role !== Role.COMPANY_ADMIN
  ) {
    throw new ForbiddenException(
      buildProblem(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        'Solo el administrador de la empresa puede verificar la constancia DGI.',
      ),
    );
  }
  if (
    subjectType === VerificationSubjectType.PROFESSIONAL &&
    role !== Role.INDEPENDENT_PRO
  ) {
    throw new ForbiddenException(
      buildProblem(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        'Solo un profesional independiente puede verificar su constancia DGI.',
      ),
    );
  }
}
