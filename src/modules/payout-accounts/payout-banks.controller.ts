import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { PayoutAccountsService } from './payout-accounts.service';

@ApiTags('payout')
@ApiBearerAuth('supabase-jwt')
@Controller('payout')
@UseGuards(SupabaseAuthGuard)
export class PayoutBanksController {
  constructor(private readonly service: PayoutAccountsService) {}

  @Get('banks')
  @ApiOperation({ summary: 'Catálogo de bancos UY activos' })
  listBanks() {
    return this.service.listBanks();
  }
}
