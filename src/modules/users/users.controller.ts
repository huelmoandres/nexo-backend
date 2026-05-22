import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { Role } from '@prisma/client';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CompanyCreatedResponseDto } from './dto/company-created-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateProfessionalProfileDto } from './dto/create-professional-profile.dto';
import { PresignDocumentDto } from './dto/presign-document.dto';
import { PresignDocumentResponseDto } from './dto/presign-document-response.dto';
import { ProfessionalProfileCreatedResponseDto } from './dto/professional-profile-created-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserEntitlementsResponseDto } from './dto/user-entitlements-response.dto';
import { UsersService } from './users.service';

/**
 * API HTTP de usuarios: perfil, empresa (rol admin), perfil profesional y presign KYC.
 * La documentación OpenAPI detallada va en los decoradores `@Api*` de cada ruta.
 */
@ApiTags('users')
@ApiBearerAuth('supabase-jwt')
@ApiExtraModels(
  UserResponseDto,
  CompanyCreatedResponseDto,
  ProfessionalProfileCreatedResponseDto,
  PresignDocumentResponseDto,
  ProblemDetail,
)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/entitlements')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({
    summary: 'Entitlements del plan del sujeto activo (profesional o empresa)',
  })
  @ApiResponse({ status: 200, type: UserEntitlementsResponseDto })
  getMyEntitlements(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserEntitlementsResponseDto> {
    return this.usersService.getMyEntitlements(user.sub);
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({
    summary: 'Perfil del usuario autenticado',
    description:
      'Incluye empresa (empleado o administrada) y perfil profesional con categorías y coordenadas si existen.',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil encontrado',
    schema: {
      example: {
        id: 'd6d34507-bfec-42f6-8c27-4aa6bd4f29ad',
        email: 'pro@nexos.com',
        fullName: 'María Profesional',
        role: 'INDEPENDENT_PRO',
        company: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'ACME Uruguay S.A.',
          rut: '214567890013',
        },
        professionalProfile: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          bio: 'Electricista matriculado.',
          experienceYears: 8,
          latitude: -34.9011,
          longitude: -56.1645,
          categories: [
            {
              id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
              name: 'Electricidad',
              slug: 'electricidad',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token ausente, inválido o revocado',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no sincronizado en base de datos',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async getMe(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.getMe(user.sub);
  }

  @Post('company')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar empresa (solo COMPANY_ADMIN)',
    description:
      'Crea la empresa, vincula al usuario como administrador y registra auditoría COMPANY_CREATED.',
  })
  @ApiBody({
    type: CreateCompanyDto,
    examples: {
      default: {
        summary: 'Empresa válida',
        value: { name: 'ACME Uruguay S.A.', rut: '214567890013' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Empresa creada',
    schema: {
      example: {
        company: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'ACME Uruguay S.A.',
          rut: '214567890013',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'RUT inválido u otro error de validación',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 403,
    description: 'Rol distinto de COMPANY_ADMIN',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'RUT duplicado o usuario ya registró una empresa',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async createCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
    @Req() request: Request,
  ): Promise<CompanyCreatedResponseDto> {
    return this.usersService.createCompany(user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  @Post('professional-profile')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear perfil profesional con ubicación PostGIS',
    description:
      'Persiste bio, experiencia, categorías y coordenadas (geography Point 4326) mediante SQL raw.',
  })
  @ApiBody({
    type: CreateProfessionalProfileDto,
    examples: {
      montevideo: {
        summary: 'Montevideo',
        value: {
          bio: 'Electricista.',
          experienceYears: 5,
          latitude: -34.9011,
          longitude: -56.1645,
          categoryIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Perfil creado',
    schema: {
      example: {
        profile: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          bio: 'Electricista.',
          experienceYears: 5,
          latitude: -34.9011,
          longitude: -56.1645,
          categories: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              name: 'Electricidad',
              slug: 'electricidad',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validación o categorías inexistentes',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'El usuario ya tiene perfil profesional',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async createProfessionalProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfessionalProfileDto,
  ): Promise<ProfessionalProfileCreatedResponseDto> {
    return this.usersService.createProfessionalProfile(user.sub, dto);
  }

  @Post('documents/presign')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'URL firmada para subir documento KYC',
    description:
      'Genera uploadUrl y persiste identityCardKey o selfieKey en el perfil profesional.',
  })
  @ApiBody({ type: PresignDocumentDto })
  @ApiResponse({
    status: 200,
    description: 'URL de subida generada',
    schema: {
      example: {
        uploadUrl:
          'https://mock-r2.cloudflarestorage.com/nexos-kyc/users/.../IDENTITY_CARD-....jpg?X-Amz-Signature=mock',
        key: 'users/uuid/kyc/IDENTITY_CARD-uuid.jpg',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sin perfil profesional',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async presignDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignDocumentDto,
  ): Promise<PresignDocumentResponseDto> {
    return this.usersService.presignDocument(user.sub, dto);
  }
}
