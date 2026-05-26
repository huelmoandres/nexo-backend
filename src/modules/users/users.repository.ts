import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  DgiVerificationStatus,
  Role,
  SubscriptionPlan,
  TrustStatus,
  VerificationDocumentStatus,
  VerificationDocumentType,
  VerificationSubjectType,
  type Company,
  type Prisma,
  type User,
} from '@prisma/client';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
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

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
    });
  }

  async linkUserAsCompanyEmployee(input: {
    userId: string;
    companyId: string;
    fullName: string;
  }): Promise<User> {
    return this.prisma.user.update({
      where: { id: input.userId },
      data: {
        role: Role.COMPANY_EMPLOYEE,
        companyId: input.companyId,
        fullName: input.fullName.trim(),
      },
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
    promoteRoleToCompanyAdmin?: boolean;
  }): Promise<Company> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.name,
          rut: input.rut,
          adminId: input.userId,
          subscriptionPlan: SubscriptionPlan.FREE,
          planDefinitionId: CATALOG_PLAN_IDS.FREE,
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

      if (input.promoteRoleToCompanyAdmin) {
        await tx.user.update({
          where: { id: input.userId },
          data: { role: Role.COMPANY_ADMIN },
        });
      }

      return company;
    });
  }

  /**
   * Crea perfil, asocia categorías y zona principal (`ServiceArea`) con PostGIS (WGS84).
   * Orden en SQL: longitud, latitud (ST_MakePoint).
   * Además inicializa agregados nuevos (`ProfessionalIdentity`, `TrustProfile`).
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
   * @param input.addressLine - Dirección libre declarada por el profesional.
   * @returns Perfil creado con sus categorías incluidas.
   */
  async createProfessionalProfileWithPostgis(input: {
    userId: string;
    bio?: string;
    experienceYears: number;
    latitude: number;
    longitude: number;
    addressLine?: string;
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
          addressLine: input.addressLine,
          countryId: input.countryId,
          stateId: input.stateId,
          cityId: input.cityId,
          neighborhoodId: input.neighborhoodId,
          subscriptionPlan: SubscriptionPlan.FREE,
          planDefinitionId: CATALOG_PLAN_IDS.FREE,
          categories: {
            create: input.categoryIds.map((categoryId) => ({
              category: { connect: { id: categoryId } },
            })),
          },
        },
        include: professionalProfileIncludeMe,
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO "ServiceArea" (
          "id", "professionalProfileId", "label", "location", "radiusMeters", "isPrimary",
          "addressLine", "countryId", "stateId", "cityId", "neighborhoodId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $3::text, 'Principal',
          ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
          5000, true, $4, $5, $6, $7, $8, NOW(), NOW()
        )`,
        input.longitude,
        input.latitude,
        profile.id,
        input.addressLine ?? null,
        input.countryId ?? null,
        input.stateId ?? null,
        input.cityId ?? null,
        input.neighborhoodId ?? null,
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
   * @returns Lat/lng de la zona principal (`ServiceArea.isPrimary`) o la más antigua.
   */
  async getProfileCoordinates(
    profileId: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ lat: number; lng: number }>
    >(
      `SELECT ST_Y(sa.location::geometry) AS lat, ST_X(sa.location::geometry) AS lng
       FROM "ServiceArea" sa
       WHERE sa."professionalProfileId" = $1
       ORDER BY sa."isPrimary" DESC, sa."createdAt" ASC
       LIMIT 1`,
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

  /** Motivo de rechazo del documento RUT_PROOF (para GET status). */
  async getRutProofRejectionReason(
    trustProfileId: string,
  ): Promise<string | null> {
    const doc = await this.prisma.verificationDocument.findFirst({
      where: {
        trustProfileId,
        documentType: VerificationDocumentType.RUT_PROOF,
      },
      orderBy: { updatedAt: 'desc' },
      select: { rejectionReason: true },
    });
    return doc?.rejectionReason ?? null;
  }

  /** Sujetos en PROCESSING cuyo updatedAt es anterior al cutoff. */
  async findStaleDgiProcessingSubjects(cutoff: Date): Promise<
    Array<{
      subjectType: VerificationSubjectType;
      subjectId: string;
      trustProfileId: string;
      userId: string;
    }>
  > {
    const companies = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        dgiVerificationStatus: DgiVerificationStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, adminId: true },
    });
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        deletedAt: null,
        dgiVerificationStatus: DgiVerificationStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, userId: true },
    });

    const companyRows = await Promise.all(
      companies.map(async (c) => {
        const trust = await this.prisma.trustProfile.findFirst({
          where: { companyId: c.id },
          select: { id: true },
        });
        if (!trust) {
          return null;
        }
        return {
          subjectType: VerificationSubjectType.COMPANY,
          subjectId: c.id,
          trustProfileId: trust.id,
          userId: c.adminId,
        };
      }),
    );

    const profileRows = await Promise.all(
      profiles.map(async (p) => {
        const trust = await this.prisma.trustProfile.findFirst({
          where: { professionalProfileId: p.id },
          select: { id: true },
        });
        if (!trust) {
          return null;
        }
        return {
          subjectType: VerificationSubjectType.PROFESSIONAL,
          subjectId: p.id,
          trustProfileId: trust.id,
          userId: p.userId,
        };
      }),
    );

    return [...companyRows, ...profileRows].filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );
  }

  /** Keys de constancias DGI referenciadas en DB (para cleanup huérfanos). */
  async listReferencedVerificationDocKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    const companies = await this.prisma.company.findMany({
      where: { dgiVerificationDocKey: { not: null } },
      select: { dgiVerificationDocKey: true },
    });
    for (const c of companies) {
      if (c.dgiVerificationDocKey) {
        keys.add(c.dgiVerificationDocKey);
      }
    }
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { dgiVerificationDocKey: { not: null } },
      select: { dgiVerificationDocKey: true },
    });
    for (const p of profiles) {
      if (p.dgiVerificationDocKey) {
        keys.add(p.dgiVerificationDocKey);
      }
    }
    const docs = await this.prisma.verificationDocument.findMany({
      where: { documentType: VerificationDocumentType.RUT_PROOF },
      select: { storageKey: true },
    });
    for (const d of docs) {
      keys.add(d.storageKey);
    }
    return keys;
  }
}
