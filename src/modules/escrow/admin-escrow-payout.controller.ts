import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { ConfirmManualPayoutDto } from './dto/confirm-manual-payout.dto';
import { ListPendingPayoutsQueryDto } from './dto/list-pending-payouts-query.dto';
import { PresignPayoutReceiptDto } from './dto/presign-payout-receipt.dto';
import { EscrowPayoutService } from './escrow-payout.service';

@ApiTags('admin-escrow-payout')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin')
export class AdminEscrowPayoutController {
  constructor(private readonly escrowPayout: EscrowPayoutService) {}

  @Get('escrow/payouts-pending')
  @ApiOperation({
    summary:
      'Listar escrows liberados pendientes de pago manual al profesional',
  })
  listPending(@Query() query: ListPendingPayoutsQueryDto) {
    return this.escrowPayout.listPendingManualPayouts(query);
  }

  @Post('jobs/:id/escrow/payout/presign-receipt')
  @ApiOperation({
    summary: 'URL firmada para subir comprobante de transferencia MP',
  })
  presignReceipt(
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body() dto: PresignPayoutReceiptDto,
  ) {
    return this.escrowPayout.presignManualPayoutReceipt(jobId, dto);
  }

  @Post('jobs/:id/escrow/payout/confirm')
  @ApiOperation({
    summary: 'Confirmar payout manual tras transferencia en Mercado Pago',
  })
  @ApiResponse({ status: 409, description: 'Ya confirmado o estado inválido' })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body() dto: ConfirmManualPayoutDto,
  ) {
    return this.escrowPayout.confirmManualPayout(jobId, user.sub, dto);
  }
}
