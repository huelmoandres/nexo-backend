import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  DgiVerificationStatus,
  Role,
  TrustStatus,
  VerificationDocumentStatus,
  VerificationDocumentType,
  VerificationSubjectType,
  type Company,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const professionalProfileIncludeMe = {
  categories: { include: { category: true } },
} as const;

export type ProfessionalProfileWithCategories =
  Prisma.ProfessionalProfileGetPayload<{
    include: typeof professionalProfileIncludeMe;
  }>;

export type UserWithMeRelations = Prisma.UserGetPayload<{
  include: {
    professionalProfile: { include: typeof professionalProfileIncludeMe };
    company: true;
    ownedCompany: true;
  };
}>;

/** Sujeto resuelto para verificación DGI (empresa o perfil profesional). */
export interface DgiVerificationSubjectRow {
  subjectType: VerificationSubjectType;
  subjectId: string;
  userId: string;
  rut: string;
  dgiVerificationStatus: DgiVerificationStatus;
  trustProfileId: string;
  dgiRazonSocial: string | null;
  dgiVerificationDocKey: string | null;
  dgiVerificationMethod: string | null;
  dgiVerifiedAt: Date | null;
}

/**
 * Persistencia de usuarios, empresas y perfiles profesionales (incl. PostGIS vía SQL raw).
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param supabaseUid - `sub` del JWT de Supabase.
   * @returns Usuario con relaciones para el endpoint “me”, o `null`.
   */
  async findBySupabaseUidForMe(
    supabaseUid: string,
  ): Promise<UserWithMeRelations | null> {
    return this.prisma.user.findFirst({
      where: { supabaseUid, deletedAt: null },
      include: {
        professionalProfile: { include: professionalProfileIncludeMe },
        company: true,
        ownedCompany: true,
      },
    });
  }

  /**
   * @param rut - RUT normalizado (12 dígitos).
   * @returns Empresa activa con ese RUT, o `null` si no existe.
   */
  async findCompanyByRut(rut: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { rut, deletedAt: null },
    });
  }

  /**
   * @param rut - RUT normalizado (12 dígitos).
   * @returns Perfil profesional activo con ese RUT, o `null`.
   */
  async findProfileByRut(rut: string): Promise<{ id: string } | null> {
    return this.prisma.professionalProfile.findFirst({
      where: { rut, deletedAt: null },
      select: { id: true },
    });
  }

  /**
   * `true` si el RUT existe en Company o ProfessionalProfile (registro global).
   */
  async isRutTakenGlobally(rut: string): Promise<boolean> {
    const [company, profile] = await Promise.all([
      this.findCompanyByRut(rut),
      this.findProfileByRut(rut),
    ]);
    return company !== null || profile !== null;
  }

  /**
   * @param adminId - ID interno del usuario administrador de la empresa.
   * @returns Empresa activa administrada por ese usuario, o `null`.
   */
  async findCompanyByAdminId(adminId: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { adminId, deletedAt: null },
    });
  }

  /**
   * @param ids - IDs de categorías solicitadas en el DTO.
   * @returns Cantidad de filas existentes (para detectar IDs inválidos).
   */
  async countCategoriesByIds(ids: string[]): Promise<number> {
    return this.prisma.category.count({
      where: { id: { in: ids } },
    });
  }

  /**
   * @param userId - ID interno del usuario.
   * @returns `true` si el usuario ya tiene un perfil profesional activo.
   */
  async hasProfessionalProfile(userId: string): Promise<boolean> {
    const row = await this.prisma.professionalProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Crea empresa y registro de auditoría `COMPANY_CREATED` en una transacción.
   * También inicializa el `TrustProfile` corporativo en estado `PENDING`.
   *
   * @param input.userId - Administrador de la nueva empresa.
   * @param input.name - Razón social normalizada.
   * @param input.rut - RUT 12 dígitos validado.
   * @param input.meta - IP y user-agent para auditoría.
   * @returns Empresa recién creada con todos sus campos.
   */
  async createCompanyWithAudit(input: {
    userId: string;
    name: string;
    rut: string;
    meta: { ipAddress?: string; userAgent?: string };
  }): Promise<Company> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.name,
          rut: input.rut,
          adminId: input.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          companyId: company.id,
          action: AuditAction.COMPANY_CREATED,
          entityType: 'Company',
          entityId: company.id,
          metadata: {
            name: input.name,
            rut: input.rut,
          },
          ipAddress: input.meta.ipAddress,
          userAgent: input.meta.userAgent,
        },
      });

      await tx.trustProfile.create({
        data: {
          subjectType: VerificationSubjectType.COMPANY,
          subjectId: company.id,
          companyId: company.id,
        },
      });

      return company;
    });
  }

  /**
   * Crea perfil, asocia categorías y asigna `location` con PostGIS (WGS84).
   * Orden en SQL: longitud, latitud (ST_MakePoint).
   * Además inicializa agregados nuevos (`ProfessionalIdentity`, `TrustProfile`)
   * para mantener dual-write encapsulado dentro del repositorio.
   *
   * @param input.userId - Propietario del perfil.
   * @param input.bio - Descripción opcional del profesional.
   * @param input.experienceYears - Años de experiencia declarados.
   * @param input.latitude - Latitud WGS84 del punto de servicio.
   * @param input.longitude - Longitud WGS84 del punto de servicio.
   * @param input.categoryIds - IDs existentes; se usa `connect` vía tabla intermedia.
   * @param input.countryId - País administrativo (opcional).
   * @param input.stateId - Departamento/state administrativo (opcional).
   * @param input.cityId - Ciudad administrativa (opcional).
   * @param input.neighborhoodId - Barrio administrativo (opcional).
   * @returns Perfil creado con sus categorías incluidas.
   */
  async createProfessionalProfileWithPostgis(input: {
    userId: string;
    bio?: string;
    experienceYears: number;
    latitude: number;
    longitude: number;
    categoryIds: string[];
    countryId?: string;
    stateId?: string;
    cityId?: string;
    neighborhoodId?: string;
    rut?: string;
    promoteRoleToIndependentPro?: boolean;
  }): Promise<ProfessionalProfileWithCategories> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.professionalProfile.create({
        data: {
          userId: input.userId,
          bio: input.bio,
          experienceYears: input.experienceYears,
          rut: input.rut,
          countryId: input.countryId,
          stateId: input.stateId,
          cityId: input.cityId,
          neighborhoodId: input.neighborhoodId,
          categories: {
            create: input.categoryIds.map((categoryId) => ({
              category: { connect: { id: categoryId } },
            })),
          },
        },
        include: professionalProfileIncludeMe,
      });

      await tx.$executeRawUnsafe(
        `UPDATE "ProfessionalProfile" SET location = ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography WHERE id = $3`,
        input.longitude,
        input.latitude,
        profile.id,
      );

      await tx.professionalIdentity.create({
        data: {
          professionalProfileId: profile.id,
        },
      });

      await tx.trustProfile.create({
        data: {
          subjectType: VerificationSubjectType.PROFESSIONAL,
          subjectId: profile.id,
          professionalProfileId: profile.id,
        },
      });

      if (input.promoteRoleToIndependentPro) {
        await tx.user.update({
          where: { id: input.userId },
          data: { role: Role.INDEPENDENT_PRO },
        });
      }

      return profile;
    });
  }

  /**
   * @param profileId - ID del `ProfessionalProfile` (tipo texto en Postgres).
   * @returns Lat/lng desde `geography` o `null` si no hay punto.
   */
  async getProfileCoordinates(
    profileId: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ lat: number; lng: number }>
    >(
      `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM "ProfessionalProfile" WHERE id = $1 AND location IS NOT NULL`,
      profileId,
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return { latitude: row.lat, longitude: row.lng };
  }

  /**
   * Actualiza claves de objeto en storage para KYC (solo campos definidos).
   *
   * @param input.userId - Dueño del perfil profesional.
   * @param input.identityCardKey - Key en R2 de la cédula de identidad (opcional).
   * @param input.selfieKey - Key en R2 de la selfie (opcional).
   */
  async updateProfessionalDocumentKey(input: {
    userId: string;
    identityCardKey?: string;
    selfieKey?: string;
  }): Promise<void> {
    const data: { identityCardKey?: string; selfieKey?: string } = {};
    if (input.identityCardKey !== undefined) {
      data.identityCardKey = input.identityCardKey;
    }
    if (input.selfieKey !== undefined) {
      data.selfieKey = input.selfieKey;
    }
    await this.prisma.professionalProfile.update({
      where: { userId: input.userId },
      data,
    });
  }

  /**
   * Resuelve el sujeto de verificación DGI para el usuario autenticado.
   */
  async findDgiVerificationSubject(input: {
    supabaseUid: string;
    subjectType: VerificationSubjectType;
  }): Promise<DgiVerificationSubjectRow | null> {
    const user = await this.prisma.user.findFirst({
      where: { supabaseUid: input.supabaseUid, deletedAt: null },
      include: {
        ownedCompany: true,
        professionalProfile: true,
      },
    });
    if (!user) {
      return null;
    }

    if (input.subjectType === VerificationSubjectType.COMPANY) {
      const company = user.ownedCompany;
      if (!company || company.deletedAt !== null) {
        return null;
      }
      const trust = await this.prisma.trustProfile.findFirst({
        where: {
          companyId: company.id,
          subjectType: VerificationSubjectType.COMPANY,
        },
        select: { id: true },
      });
      if (!trust) {
        return null;
      }
      return {
        subjectType: VerificationSubjectType.COMPANY,
        subjectId: company.id,
        userId: user.id,
        rut: company.rut,
        dgiVerificationStatus: company.dgiVerificationStatus,
        trustProfileId: trust.id,
        dgiRazonSocial: company.dgiRazonSocial,
        dgiVerificationDocKey: company.dgiVerificationDocKey,
        dgiVerificationMethod: company.dgiVerificationMethod,
        dgiVerifiedAt: company.dgiVerifiedAt,
      };
    }

    const profile = user.professionalProfile;
    if (!profile || profile.deletedAt !== null || !profile.rut) {
      return null;
    }
    const trust = await this.prisma.trustProfile.findFirst({
      where: {
        professionalProfileId: profile.id,
        subjectType: VerificationSubjectType.PROFESSIONAL,
      },
      select: { id: true },
    });
    if (!trust) {
      return null;
    }
    return {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: profile.id,
      userId: user.id,
      rut: profile.rut,
      dgiVerificationStatus: profile.dgiVerificationStatus,
      trustProfileId: trust.id,
      dgiRazonSocial: profile.dgiRazonSocial,
      dgiVerificationDocKey: profile.dgiVerificationDocKey,
      dgiVerificationMethod: profile.dgiVerificationMethod,
      dgiVerifiedAt: profile.dgiVerifiedAt,
    };
  }

  /**
   * Marca verificación en PROCESSING y registra/actualiza documento RUT_PROOF.
   */
  async markDgiVerificationProcessing(input: {
    subjectType: VerificationSubjectType;
    subjectId: string;
    storageKey: string;
    trustProfileId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = DgiVerificationStatus.PROCESSING;
      if (input.subjectType === VerificationSubjectType.COMPANY) {
        await tx.company.update({
          where: { id: input.subjectId },
          data: {
            dgiVerificationStatus: status,
            dgiVerificationDocKey: input.storageKey,
          },
        });
      } else {
        await tx.professionalProfile.update({
          where: { id: input.subjectId },
          data: {
            dgiVerificationStatus: status,
            dgiVerificationDocKey: input.storageKey,
          },
        });
      }

      const existing = await tx.verificationDocument.findFirst({
        where: {
          trustProfileId: input.trustProfileId,
          documentType: VerificationDocumentType.RUT_PROOF,
        },
      });
      if (existing) {
        await tx.verificationDocument.update({
          where: { id: existing.id },
          data: {
            storageKey: input.storageKey,
            status: VerificationDocumentStatus.PENDING,
            reviewedAt: null,
            reviewedBy: null,
            rejectionReason: null,
          },
        });
      } else {
        await tx.verificationDocument.create({
          data: {
            trustProfileId: input.trustProfileId,
            documentType: VerificationDocumentType.RUT_PROOF,
            storageKey: input.storageKey,
            status: VerificationDocumentStatus.PENDING,
          },
        });
      }
    });
  }

  /**
   * Persiste resultado automático o manual del worker/admin.
   */
  async applyDgiVerificationResult(input: {
    subjectType: VerificationSubjectType;
    subjectId: string;
    trustProfileId: string;
    status: DgiVerificationStatus;
    method?: string;
    dgiRazonSocial?: string;
    documentStatus: VerificationDocumentStatus;
    rejectionReason?: string;
    reviewedBy?: string;
  }): Promise<void> {
    const verifiedAt =
      input.status === DgiVerificationStatus.VERIFIED_AUTO
        ? new Date()
        : undefined;
    const trustStatus =
      input.status === DgiVerificationStatus.VERIFIED_AUTO
        ? TrustStatus.VERIFIED
        : undefined;

    await this.prisma.$transaction(async (tx) => {
      const data = {
        dgiVerificationStatus: input.status,
        dgiVerificationMethod: input.method ?? null,
        dgiRazonSocial: input.dgiRazonSocial ?? undefined,
        dgiVerifiedAt: verifiedAt,
      };

      if (input.subjectType === VerificationSubjectType.COMPANY) {
        await tx.company.update({
          where: { id: input.subjectId },
          data,
        });
      } else {
        await tx.professionalProfile.update({
          where: { id: input.subjectId },
          data,
        });
      }

      if (trustStatus) {
        await tx.trustProfile.update({
          where: { id: input.trustProfileId },
          data: {
            status: trustStatus,
            verifiedAt: new Date(),
          },
        });
      }

      await tx.verificationDocument.updateMany({
        where: {
          trustProfileId: input.trustProfileId,
          documentType: VerificationDocumentType.RUT_PROOF,
        },
        data: {
          status: input.documentStatus,
          reviewedAt:
            input.documentStatus !== VerificationDocumentStatus.PENDING
              ? new Date()
              : null,
          reviewedBy: input.reviewedBy ?? null,
          rejectionReason: input.rejectionReason ?? null,
        },
      });
    });
  }

  /** Listado admin: empresas y profesionales en revisión manual. */
  async listPendingManualDgiVerifications(): Promise<
    Array<{
      subjectType: VerificationSubjectType;
      subjectId: string;
      rut: string;
      dgiRazonSocial: string | null;
      dgiVerificationDocKey: string | null;
      updatedAt: Date;
    }>
  > {
    const [companies, profiles] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
          deletedAt: null,
        },
        select: {
          id: true,
          rut: true,
          dgiRazonSocial: true,
          dgiVerificationDocKey: true,
          updatedAt: true,
        },
      }),
      this.prisma.professionalProfile.findMany({
        where: {
          dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
          deletedAt: null,
          rut: { not: null },
        },
        select: {
          id: true,
          rut: true,
          dgiRazonSocial: true,
          dgiVerificationDocKey: true,
          updatedAt: true,
        },
      }),
    ]);

    const companyRows = companies.map((c) => ({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: c.id,
      rut: c.rut,
      dgiRazonSocial: c.dgiRazonSocial,
      dgiVerificationDocKey: c.dgiVerificationDocKey,
      updatedAt: c.updatedAt,
    }));

    const profileRows = profiles
      .filter((p): p is typeof p & { rut: string } => p.rut !== null)
      .map((p) => ({
        subjectType: VerificationSubjectType.PROFESSIONAL,
        subjectId: p.id,
        rut: p.rut,
        dgiRazonSocial: p.dgiRazonSocial,
        dgiVerificationDocKey: p.dgiVerificationDocKey,
        updatedAt: p.updatedAt,
      }));

    return [...companyRows, ...profileRows].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  /** Resuelve sujeto por id para revisión admin (sin filtro de usuario). */
  async findDgiSubjectById(input: {
    subjectType: VerificationSubjectType;
    subjectId: string;
  }): Promise<DgiVerificationSubjectRow | null> {
    if (input.subjectType === VerificationSubjectType.COMPANY) {
      const company = await this.prisma.company.findFirst({
        where: { id: input.subjectId, deletedAt: null },
      });
      if (!company) {
        return null;
      }
      const trust = await this.prisma.trustProfile.findFirst({
        where: { companyId: company.id },
        select: { id: true },
      });
      if (!trust) {
        return null;
      }
      return {
        subjectType: VerificationSubjectType.COMPANY,
        subjectId: company.id,
        userId: company.adminId,
        rut: company.rut,
        dgiVerificationStatus: company.dgiVerificationStatus,
        trustProfileId: trust.id,
        dgiRazonSocial: company.dgiRazonSocial,
        dgiVerificationDocKey: company.dgiVerificationDocKey,
        dgiVerificationMethod: company.dgiVerificationMethod,
        dgiVerifiedAt: company.dgiVerifiedAt,
      };
    }

    const profile = await this.prisma.professionalProfile.findFirst({
      where: { id: input.subjectId, deletedAt: null },
    });
    if (!profile?.rut) {
      return null;
    }
    const trust = await this.prisma.trustProfile.findFirst({
      where: { professionalProfileId: profile.id },
      select: { id: true },
    });
    if (!trust) {
      return null;
    }
    return {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: profile.id,
      userId: profile.userId,
      rut: profile.rut,
      dgiVerificationStatus: profile.dgiVerificationStatus,
      trustProfileId: trust.id,
      dgiRazonSocial: profile.dgiRazonSocial,
      dgiVerificationDocKey: profile.dgiVerificationDocKey,
      dgiVerificationMethod: profile.dgiVerificationMethod,
      dgiVerifiedAt: profile.dgiVerifiedAt,
    };
  }
}
