import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '@common/decorators/public.decorator';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { ConsentPreviewResponseDto } from './dto/consent-preview-response.dto';
import { DeclineConsentDto } from './dto/decline-consent.dto';
import { PortfolioConsentService } from './services/portfolio-consent.service';

/**
 * Endpoints de consentimiento del portfolio (cliente con token, sin JWT).
 */
@Public()
@ApiTags('portfolio')
@ApiExtraModels(ConsentPreviewResponseDto, DeclineConsentDto, ProblemDetail)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('portfolio')
export class PortfolioConsentController {
  constructor(private readonly consentService: PortfolioConsentService) {}

  @Get('consents/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview del consentimiento (público)',
    description:
      'Metadatos del Job y del item para que el cliente valide antes de aceptar o declinar.',
  })
  @ApiParam({ name: 'token', format: 'uuid' })
  @ApiResponse({ status: 200, type: ConsentPreviewResponseDto })
  @ApiResponse({
    status: 404,
    description: 'CONSENT_TOKEN_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 410,
    description: 'CONSENT_TOKEN_EXPIRED o CONSENT_ALREADY_RESOLVED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async getConsentPreview(
    @Param('token', ParseUUIDPipe) token: string,
  ): Promise<ConsentPreviewResponseDto> {
    return this.consentService.getConsentPreview(token);
  }

  @Post('consents/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aceptar verificación del portfolio',
    description:
      'Marca el consent ACCEPTED y `verifiedFromJob=true` en una transacción serializable.',
  })
  @ApiParam({ name: 'token', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Aceptado' })
  @ApiResponse({
    status: 404,
    description: 'CONSENT_TOKEN_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'PORTFOLIO_ALREADY_VERIFIED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 410,
    description: 'CONSENT_TOKEN_EXPIRED o CONSENT_ALREADY_RESOLVED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async acceptConsent(
    @Param('token', ParseUUIDPipe) token: string,
  ): Promise<void> {
    await this.consentService.acceptConsent(token);
  }

  @Post('consents/:token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Rechazar verificación del portfolio',
    description:
      'Marca DECLINED; si el motivo es INAPPROPRIATE, el item pasa a HIDDEN_PENDING_REVIEW.',
  })
  @ApiParam({ name: 'token', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Rechazado' })
  @ApiResponse({
    status: 404,
    description: 'CONSENT_TOKEN_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 410,
    description: 'CONSENT_TOKEN_EXPIRED o CONSENT_ALREADY_RESOLVED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async declineConsent(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() dto: DeclineConsentDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.consentService.declineConsent(token, dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }
}
