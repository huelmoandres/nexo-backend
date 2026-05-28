import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/users/decorators/roles.decorator';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { AdminProcessAuditService } from './admin-process-audit.service';
import { ListProcessAuditQueryDto } from './dto/list-process-audit-query.dto';
import { ListProcessAuditResponseDto } from './dto/process-audit-item.dto';

@ApiTags('admin')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/process-audit')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminProcessAuditController {
  constructor(private readonly service: AdminProcessAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Listar auditoría de procesos (integración)' })
  @ApiResponse({ status: 200, type: ListProcessAuditResponseDto })
  list(
    @Query() query: ListProcessAuditQueryDto,
  ): Promise<ListProcessAuditResponseDto> {
    return this.service.list(query);
  }
}
