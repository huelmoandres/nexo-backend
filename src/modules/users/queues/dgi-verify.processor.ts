import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  DgiVerificationStatus,
  VerificationDocumentStatus,
  VerificationSubjectType,
} from '@prisma/client';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { normalizeRutDigits } from '../utils/rut.validator';
import { extractQrUrlFromPdf } from '../lib/pdf-qr-extractor';
import { parseConstanciaFromPdfText } from '../lib/pdf-text-parser';
import {
  DGI_RUT_LOOKUP_TOKEN,
  type IDgiRutLookupProvider,
} from '../providers/dgi-rut-lookup.provider';
import { UsersRepository } from '../users.repository';
import {
  DGI_TECHNICAL_REJECTION_REASON,
  DGI_VERIFY_JOB,
  DGI_VERIFY_QUEUE,
} from '../users-dgi.constants';

export interface DgiVerifyJobData {
  subjectType: VerificationSubjectType;
  subjectId: string;
  storageKey: string;
  expectedRut: string;
  trustProfileId: string;
}

@Processor(DGI_VERIFY_QUEUE)
export class DgiVerifyProcessor extends WorkerHost {
  private readonly logger = new Logger(DgiVerifyProcessor.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    @Inject(DGI_RUT_LOOKUP_TOKEN)
    private readonly dgiLookup: IDgiRutLookupProvider,
    @Inject(usersConfig.KEY)
    private readonly usersCfg: ConfigType<typeof usersConfig>,
    @Inject(dgiConfig.KEY)
    private readonly dgiCfg: ConfigType<typeof dgiConfig>,
  ) {
    super();
  }

  async process(job: Job<DgiVerifyJobData>): Promise<void> {
    if (job.name !== DGI_VERIFY_JOB) {
      this.logger.warn({ op: 'dgi.verify.unknownJob', jobName: job.name });
      return;
    }

    const { subjectType, subjectId, storageKey, expectedRut, trustProfileId } =
      job.data;

    this.logger.log({
      op: 'dgi.verify.start',
      jobId: job.id,
      subjectType,
      subjectId,
      storageKey,
    });

    try {
      await this.runVerification(
        subjectType,
        subjectId,
        storageKey,
        expectedRut,
        trustProfileId,
      );
    } catch (err) {
      this.logger.error({
        op: 'dgi.verify.unhandled',
        err: err instanceof Error ? err.message : String(err),
        subjectId,
      });
      await this.reject(
        subjectType,
        subjectId,
        trustProfileId,
        DGI_TECHNICAL_REJECTION_REASON,
      );
    }

    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    this.logger.log({
      op: 'dgi.verify.done',
      jobId: job.id,
      subjectId,
      status: subject?.dgiVerificationStatus,
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DgiVerifyJobData> | undefined): Promise<void> {
    if (!job?.data || job.name !== DGI_VERIFY_JOB) {
      return;
    }
    const { subjectType, subjectId, trustProfileId } = job.data;
    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    if (
      !subject ||
      subject.dgiVerificationStatus !== DgiVerificationStatus.PROCESSING
    ) {
      return;
    }
    await this.reject(
      subjectType,
      subjectId,
      trustProfileId,
      DGI_TECHNICAL_REJECTION_REASON,
    );
  }

  private async runVerification(
    subjectType: VerificationSubjectType,
    subjectId: string,
    storageKey: string,
    expectedRut: string,
    trustProfileId: string,
  ): Promise<void> {
    const expected = normalizeRutDigits(expectedRut);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.storage.downloadObject(
        storageKey,
        this.usersCfg.kycBucket,
      );
      if (pdfBuffer.length > this.dgiCfg.pdfMaxBytes) {
        throw new Error('PDF exceeds max size');
      }
    } catch (err) {
      this.logger.error({
        op: 'dgi.verify.downloadFailed',
        err: err instanceof Error ? err.message : String(err),
        subjectId,
      });
      await this.reject(
        subjectType,
        subjectId,
        trustProfileId,
        'No se pudo leer el documento PDF.',
      );
      return;
    }

    const qrUrl = await extractQrUrlFromPdf(pdfBuffer);
    if (qrUrl) {
      const qrResult = await this.tryQrStrategy(
        qrUrl,
        expected,
        subjectType,
        subjectId,
        trustProfileId,
      );
      if (qrResult) {
        return;
      }
    }

    await this.tryTextStrategy(
      pdfBuffer,
      expected,
      subjectType,
      subjectId,
      trustProfileId,
    );
  }

  private async tryQrStrategy(
    qrUrl: string,
    expectedRut: string,
    subjectType: VerificationSubjectType,
    subjectId: string,
    trustProfileId: string,
  ): Promise<boolean> {
    try {
      const lookup = await this.dgiLookup.lookup(qrUrl);
      const rutFromDgi = normalizeRutDigits(lookup.rut);

      if (rutFromDgi !== expectedRut) {
        this.logger.warn({
          op: 'dgi.verify.rutMismatch',
          expectedRut,
          rutFromDgi,
          subjectId,
        });
        await this.reject(
          subjectType,
          subjectId,
          trustProfileId,
          'El RUT de la constancia DGI no coincide con el registrado.',
        );
        return true;
      }

      if (!lookup.activo) {
        await this.reject(
          subjectType,
          subjectId,
          trustProfileId,
          'La empresa no figura como activa en DGI.',
        );
        return true;
      }

      await this.usersRepository.applyDgiVerificationResult({
        subjectType,
        subjectId,
        trustProfileId,
        status: DgiVerificationStatus.VERIFIED_AUTO,
        method: 'QR',
        dgiRazonSocial: lookup.razonSocial,
        documentStatus: VerificationDocumentStatus.APPROVED,
      });
      await this.notifyVerified(
        subjectType,
        subjectId,
        trustProfileId,
        lookup.razonSocial,
      );
      this.logger.log({
        op: 'dgi.verify.qrSuccess',
        subjectType,
        subjectId,
      });
      return true;
    } catch (err) {
      this.logger.warn({
        op: 'dgi.verify.qrFailed',
        err: err instanceof Error ? err.message : String(err),
        subjectId,
      });
      return false;
    }
  }

  private async tryTextStrategy(
    pdfBuffer: Buffer,
    expectedRut: string,
    subjectType: VerificationSubjectType,
    subjectId: string,
    trustProfileId: string,
  ): Promise<void> {
    try {
      const parsed = await parseConstanciaFromPdfText(pdfBuffer);
      const rutText = parsed.rut ? normalizeRutDigits(parsed.rut) : undefined;

      if (rutText && rutText === expectedRut) {
        await this.usersRepository.applyDgiVerificationResult({
          subjectType,
          subjectId,
          trustProfileId,
          status: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
          method: 'TEXT_MATCH',
          dgiRazonSocial: parsed.razonSocial,
          documentStatus: VerificationDocumentStatus.PENDING,
        });
        await this.notifyManualReview(subjectType, subjectId, trustProfileId);
        this.logger.log({
          op: 'dgi.verify.textPendingReview',
          subjectType,
          subjectId,
        });
        return;
      }

      await this.reject(
        subjectType,
        subjectId,
        trustProfileId,
        rutText
          ? 'El RUT extraído del PDF no coincide con el registrado.'
          : 'No se pudo extraer un RUT válido del documento.',
      );
    } catch (err) {
      this.logger.error({
        op: 'dgi.verify.textFailed',
        err: err instanceof Error ? err.message : String(err),
        subjectId,
      });
      await this.reject(
        subjectType,
        subjectId,
        trustProfileId,
        'Error al analizar el texto del PDF.',
      );
    }
  }

  private async reject(
    subjectType: VerificationSubjectType,
    subjectId: string,
    trustProfileId: string,
    reason: string,
  ): Promise<void> {
    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    if (
      subject &&
      subject.dgiVerificationStatus !== DgiVerificationStatus.PROCESSING
    ) {
      return;
    }

    await this.usersRepository.applyDgiVerificationResult({
      subjectType,
      subjectId,
      trustProfileId,
      status: DgiVerificationStatus.REJECTED,
      documentStatus: VerificationDocumentStatus.REJECTED,
      rejectionReason: reason,
    });

    const userId = subject?.userId;
    if (userId) {
      await this.notifications.notifyDgiVerificationRejected({
        userId,
        trustProfileId,
        reason,
      });
    }
  }

  private async notifyVerified(
    subjectType: VerificationSubjectType,
    subjectId: string,
    trustProfileId: string,
    razonSocial: string,
  ): Promise<void> {
    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    if (!subject) {
      return;
    }
    await this.notifications.notifyDgiVerificationVerified({
      userId: subject.userId,
      trustProfileId,
      razonSocial,
    });
  }

  private async notifyManualReview(
    subjectType: VerificationSubjectType,
    subjectId: string,
    trustProfileId: string,
  ): Promise<void> {
    const subject = await this.usersRepository.findDgiSubjectById({
      subjectType,
      subjectId,
    });
    if (!subject) {
      return;
    }
    await this.notifications.notifyDgiVerificationManualReview({
      userId: subject.userId,
      trustProfileId,
    });
  }
}
