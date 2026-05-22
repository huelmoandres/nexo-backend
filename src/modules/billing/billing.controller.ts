import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { BillingService } from './billing.service';
import { SubscribeBillingDto } from './dto/subscribe-billing.dto';
import { BillingPlansResponseDto } from './dto/billing-plans-response.dto';
import {
  BillingSubscriptionResponseDto,
  SubscribeBillingResponseDto,
} from './dto/billing-subscription-response.dto';

@ApiTags('billing')
@ApiBearerAuth('supabase-jwt')
@Controller('billing')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Catálogo de planes SaaS (USD)' })
  @ApiResponse({ status: 200, type: BillingPlansResponseDto })
  listPlans(): BillingPlansResponseDto {
    return this.billingService.listPlans();
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Iniciar suscripción PRO/BUSINESS en Mercado Pago' })
  @ApiResponse({ status: 201, type: SubscribeBillingResponseDto })
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubscribeBillingDto,
  ): Promise<SubscribeBillingResponseDto> {
    return this.billingService.subscribe(user.sub, dto);
  }

  @Get('subscription')
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Estado de la suscripción del sujeto autenticado' })
  @ApiResponse({ status: 200, type: BillingSubscriptionResponseDto })
  getSubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BillingSubscriptionResponseDto> {
    return this.billingService.getSubscription(user.sub);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Cancelar suscripción (corta cobro recurrente en MP)',
  })
  @ApiResponse({ status: 200, type: BillingSubscriptionResponseDto })
  cancelSubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BillingSubscriptionResponseDto> {
    return this.billingService.cancelSubscription(user.sub);
  }
}
