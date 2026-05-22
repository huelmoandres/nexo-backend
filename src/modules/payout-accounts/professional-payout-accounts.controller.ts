import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { CreatePayoutAccountDto } from './dto/create-payout-account.dto';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { PayoutAccountsService } from './payout-accounts.service';

@ApiTags('payout')
@ApiBearerAuth('supabase-jwt')
@Controller('professionals/me/payout-accounts')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.INDEPENDENT_PRO)
export class ProfessionalPayoutAccountsController {
  constructor(private readonly service: PayoutAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar cuentas de cobro del profesional' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForCurrentProfessional(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutAccountDto,
  ) {
    return this.service.createForCurrentProfessional(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutAccountDto,
  ) {
    return this.service.updateForCurrentProfessional(user.sub, id, dto);
  }

  @Post(':id/set-primary')
  setPrimary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setPrimaryForCurrentProfessional(user.sub, id);
  }

  @Delete(':id')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateForCurrentProfessional(user.sub, id);
  }
}
