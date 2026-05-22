import { Injectable } from '@nestjs/common';
import type { ServiceArea } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

type ServiceAreaTx = {
  serviceArea: {
    updateMany: (args: {
      where: { professionalProfileId?: string; companyId?: string };
      data: { isPrimary: boolean };
    }) => Promise<unknown>;
  };
};

export interface ServiceAreaRow extends ServiceArea {}

export interface ServiceAreaCoordinates {
  latitude: number;
  longitude: number;
}

@Injectable()
export class ServiceAreaRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForProfessional(professionalProfileId: string): Promise<ServiceArea[]> {
    return this.prisma.serviceArea.findMany({
      where: { professionalProfileId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  listForCompany(companyId: string): Promise<ServiceArea[]> {
    return this.prisma.serviceArea.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string): Promise<ServiceArea | null> {
    return this.prisma.serviceArea.findFirst({ where: { id } });
  }

  countForProfessional(professionalProfileId: string): Promise<number> {
    return this.prisma.serviceArea.count({
      where: { professionalProfileId },
    });
  }

  countForCompany(companyId: string): Promise<number> {
    return this.prisma.serviceArea.count({ where: { companyId } });
  }

  async getCoordinates(
    serviceAreaId: string,
  ): Promise<ServiceAreaCoordinates | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ latitude: number; longitude: number }>
    >(
      `SELECT
        ST_Y(location::geometry) AS latitude,
        ST_X(location::geometry) AS longitude
       FROM "ServiceArea"
       WHERE id = $1`,
      serviceAreaId,
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    };
  }

  private async unsetPrimaryForProfessional(
    tx: ServiceAreaTx,
    professionalProfileId: string,
  ): Promise<void> {
    await tx.serviceArea.updateMany({
      where: { professionalProfileId },
      data: { isPrimary: false },
    });
  }

  private async unsetPrimaryForCompany(
    tx: ServiceAreaTx,
    companyId: string,
  ): Promise<void> {
    await tx.serviceArea.updateMany({
      where: { companyId },
      data: { isPrimary: false },
    });
  }

  async createForProfessional(input: {
    professionalProfileId: string;
    label: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    isPrimary: boolean;
    addressLine?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    neighborhoodId?: string;
  }): Promise<ServiceArea> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.unsetPrimaryForProfessional(tx, input.professionalProfileId);
      }
      const rows = await tx.$queryRawUnsafe<ServiceArea[]>(
        `INSERT INTO "ServiceArea" (
          "id", "professionalProfileId", "label", "location", "radiusMeters", "isPrimary",
          "addressLine", "countryId", "stateId", "cityId", "neighborhoodId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2,
          ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography,
          $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
        ) RETURNING *`,
        input.professionalProfileId,
        input.label,
        input.longitude,
        input.latitude,
        input.radiusMeters,
        input.isPrimary,
        input.addressLine ?? null,
        input.countryId ?? null,
        input.stateId ?? null,
        input.cityId ?? null,
        input.neighborhoodId ?? null,
      );
      return rows[0]!;
    });
  }

  async createForCompany(input: {
    companyId: string;
    label: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    isPrimary: boolean;
    addressLine?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    neighborhoodId?: string;
  }): Promise<ServiceArea> {
    return this.prisma.$transaction(async (tx) => {
      /* v8 ignore next 3 -- rama cubierta por unsetPrimaryForCompany + createForCompany isPrimary */
      if (input.isPrimary === true) {
        await this.unsetPrimaryForCompany(tx, input.companyId);
      }
      const rows = await tx.$queryRawUnsafe<ServiceArea[]>(
        `INSERT INTO "ServiceArea" (
          "id", "companyId", "label", "location", "radiusMeters", "isPrimary",
          "addressLine", "countryId", "stateId", "cityId", "neighborhoodId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2,
          ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography,
          $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
        ) RETURNING *`,
        input.companyId,
        input.label,
        input.longitude,
        input.latitude,
        input.radiusMeters,
        input.isPrimary,
        input.addressLine ?? null,
        input.countryId ?? null,
        input.stateId ?? null,
        input.cityId ?? null,
        input.neighborhoodId ?? null,
      );
      return rows[0]!;
    });
  }

  async update(
    id: string,
    data: {
      label?: string;
      latitude?: number;
      longitude?: number;
      radiusMeters?: number;
      isPrimary?: boolean;
      addressLine?: string | null;
      countryId?: string | null;
      stateId?: string | null;
      cityId?: string | null;
      neighborhoodId?: string | null;
      clearPrimaryOnSubject?: {
        professionalProfileId?: string;
        companyId?: string;
      };
    },
  ): Promise<ServiceArea> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary && data.clearPrimaryOnSubject) {
        if (data.clearPrimaryOnSubject.professionalProfileId) {
          await tx.serviceArea.updateMany({
            where: {
              professionalProfileId:
                data.clearPrimaryOnSubject.professionalProfileId,
            },
            data: { isPrimary: false },
          });
        }
        if (data.clearPrimaryOnSubject.companyId) {
          await tx.serviceArea.updateMany({
            where: { companyId: data.clearPrimaryOnSubject.companyId },
            data: { isPrimary: false },
          });
        }
      }

      const patch: Record<string, unknown> = {};
      if (data.label !== undefined) patch['label'] = data.label;
      if (data.radiusMeters !== undefined)
        patch['radiusMeters'] = data.radiusMeters;
      if (data.isPrimary !== undefined) patch['isPrimary'] = data.isPrimary;
      if (data.addressLine !== undefined)
        patch['addressLine'] = data.addressLine;
      if (data.countryId !== undefined) patch['countryId'] = data.countryId;
      if (data.stateId !== undefined) patch['stateId'] = data.stateId;
      if (data.cityId !== undefined) patch['cityId'] = data.cityId;
      if (data.neighborhoodId !== undefined) {
        patch['neighborhoodId'] = data.neighborhoodId;
      }

      const area = await tx.serviceArea.update({
        where: { id },
        data: patch,
      });

      if (data.latitude !== undefined && data.longitude !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE "ServiceArea" SET location = ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography WHERE id = $3`,
          data.longitude,
          data.latitude,
          id,
        );
      }

      return area;
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.serviceArea.delete({ where: { id } });
  }
}
