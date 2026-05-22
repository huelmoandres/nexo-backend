import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { CreateChangeOrderDto } from './dto/create-change-order.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { PatchChangeOrderDto } from './dto/patch-change-order.dto';
import { PatchJobStatusDto } from './dto/patch-job-status.dto';
import { AcceptJobPayoutDto } from '@modules/payout-accounts/dto/accept-job-payout.dto';
import { RetryPayoutDto } from '@modules/payout-accounts/dto/retry-payout.dto';
import { EscrowPayoutService } from '@modules/escrow/escrow-payout.service';
import { PaymentsService } from '@modules/payments/payments.service';
import { JobCheckoutResponseDto } from '@modules/payments/dto/job-checkout-response.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth('supabase-jwt')
@Controller('jobs')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly escrowPayout: EscrowPayoutService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Publicar trabajo' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.sub, dto);
  }

  @Get('mine')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Trabajos del cliente' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.listMine(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('available')
  @Roles(Role.INDEPENDENT_PRO)
  @ApiOperation({ summary: 'Trabajos PENDING disponibles' })
  listAvailable(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.listAvailable(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del trabajo' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.getById(user.sub, id);
  }

  @Post(':id/checkout')
  @Roles(Role.CLIENT)
  @ApiOperation({
    summary: 'Iniciar Checkout Pro (Mercado Pago) — monto en UYU',
  })
  createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobCheckoutResponseDto> {
    return this.paymentsService.createJobCheckout(user.sub, id);
  }

  @Post(':id/accept')
  @Roles(Role.INDEPENDENT_PRO)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcceptJobPayoutDto,
  ) {
    return this.jobsService.accept(user.sub, id, body.payoutAccountId);
  }

  @Get(':id/escrow/payout-attempts')
  @ApiOperation({ summary: 'Historial de intentos de payout del escrow' })
  listPayoutAttempts(@Param('id', ParseUUIDPipe) id: string) {
    return this.escrowPayout.listAttemptsForJob(id);
  }

  @Post(':id/escrow/payout/retry')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reintentar payout fallido' })
  retryPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RetryPayoutDto,
  ) {
    return this.jobsService.retryPayout(user.sub, id, body.payoutAccountId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transición de estado' })
  patchStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchJobStatusDto,
  ) {
    return this.jobsService.patchStatus(user.sub, id, dto);
  }

  @Post(':id/complete')
  @Roles(Role.INDEPENDENT_PRO)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.complete(user.sub, id);
  }

  @Post(':id/approve-completion')
  @Roles(Role.CLIENT)
  approveCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.approveCompletion(user.sub, id);
  }

  @Post(':id/change-orders')
  @Roles(Role.INDEPENDENT_PRO)
  createChangeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChangeOrderDto,
  ) {
    return this.jobsService.createChangeOrder(user.sub, id, dto);
  }

  @Patch(':id/change-orders/:coId')
  @Roles(Role.CLIENT)
  patchChangeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('coId', ParseUUIDPipe) coId: string,
    @Body() dto: PatchChangeOrderDto,
  ) {
    return this.jobsService.patchChangeOrder(user.sub, id, coId, dto);
  }
}
