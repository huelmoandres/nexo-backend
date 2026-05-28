import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role, VerificationSubjectType } from '@prisma/client';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { AuthorizationService } from '@modules/authorization/authorization.service';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { PresignDocumentResponseDto } from './dto/presign-document-response.dto';
import { PresignVerificationDocumentDto } from './dto/presign-verification-document.dto';
import { VerifyRutDocumentDto } from './dto/verify-rut-document.dto';
import { VerificationStatusResponseDto } from './dto/verification-status-response.dto';
import { VerificationSubmitResponseDto } from './dto/verification-submit-response.dto';
import {
  DgiVerificationService,
  assertRoleForDgiSubject,
} from './services/dgi-verification.service';

@ApiTags('users')
@ApiBearerAuth('supabase-jwt')
@Controller('users/verification')
export class DgiVerificationController {
  constructor(
    private readonly dgiVerificationService: DgiVerificationService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post('presign-document')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN, Role.INDEPENDENT_PRO)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Presign PDF constancia DGI' })
  @ApiBody({ type: PresignVerificationDocumentDto })
  @ApiResponse({ status: 200, type: PresignDocumentResponseDto })
  async presignDocument(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: PresignVerificationDocumentDto,
  ): Promise<PresignDocumentResponseDto> {
    const role = await this.authorizationService.getUserRole(authUser.sub);
    assertRoleForDgiSubject(role, dto.subjectType);
    return this.dgiVerificationService.presignVerificationDocument(
      authUser.sub,
      dto,
    );
  }

  @Post('submit')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN, Role.INDEPENDENT_PRO)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar constancia DGI para verificación async' })
  @ApiBody({ type: VerifyRutDocumentDto })
  @ApiResponse({ status: 202, type: VerificationSubmitResponseDto })
  async submit(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: VerifyRutDocumentDto,
  ): Promise<VerificationSubmitResponseDto> {
    const role = await this.authorizationService.getUserRole(authUser.sub);
    assertRoleForDgiSubject(role, dto.subjectType);
    return this.dgiVerificationService.submitVerification(authUser.sub, dto);
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN, Role.INDEPENDENT_PRO)
  @ApiOperation({ summary: 'Estado de verificación DGI del sujeto' })
  @ApiQuery({ name: 'subjectType', enum: VerificationSubjectType })
  @ApiResponse({ status: 200, type: VerificationStatusResponseDto })
  async status(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query('subjectType') subjectType: VerificationSubjectType,
  ): Promise<VerificationStatusResponseDto> {
    const role = await this.authorizationService.getUserRole(authUser.sub);
    assertRoleForDgiSubject(role, subjectType);
    return this.dgiVerificationService.getVerificationStatus(
      authUser.sub,
      subjectType,
    );
  }
}
