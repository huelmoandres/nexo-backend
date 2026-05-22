import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PayoutAccountsService } from './payout-accounts.service';

@ApiTags('payout')
@ApiBearerAuth('supabase-jwt')
@Controller('companies/:companyId/payout-accounts')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN)
export class CompanyPayoutAccountsController {
  constructor(private readonly service: PayoutAccountsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.service.listForCompany(user.sub, companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreatePayoutAccountDto,
  ) {
    return this.service.createForCompany(user.sub, companyId, dto);
  }

  @Post(':id/set-primary')
  @ApiOperation({ summary: 'Marcar cuenta primaria de la empresa' })
  setPrimary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setPrimaryForCompany(user.sub, companyId, id);
  }
}
