import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import {
  AssignSubscriptionPlanDto,
  CreateCustomPlanDto,
} from './dto/assign-plan.dto';
import { UpdatePlanDefinitionDto } from './dto/plan-entitlements.dto';
import { PlansAdminService } from './plans-admin.service';

@ApiTags('admin-plans')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin')
export class AdminPlansController {
  constructor(private readonly plansAdmin: PlansAdminService) {}

  @Get('plan-definitions')
  @ApiOperation({ summary: 'Listar planes de catálogo (FREE/PRO/BUSINESS)' })
  listCatalog() {
    return this.plansAdmin.listCatalog();
  }

  @Patch('plan-definitions/:id')
  @ApiOperation({ summary: 'Editar entitlements de un plan de catálogo' })
  updateCatalog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDefinitionDto,
  ) {
    return this.plansAdmin.updateCatalogPlan(id, dto);
  }

  @Patch('professionals/:id/plan')
  @ApiOperation({ summary: 'Asignar plan a un perfil profesional' })
  assignProfessionalPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSubscriptionPlanDto,
  ) {
    return this.plansAdmin.assignProfessionalPlan(id, dto);
  }

  @Post('professionals/:id/custom-plan')
  @ApiOperation({ summary: 'Crear plan CUSTOM para un profesional' })
  createProfessionalCustom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCustomPlanDto,
  ) {
    return this.plansAdmin.createProfessionalCustomPlan(id, dto);
  }

  @Patch('companies/:id/plan')
  @ApiOperation({ summary: 'Asignar plan a una empresa' })
  assignCompanyPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSubscriptionPlanDto,
  ) {
    return this.plansAdmin.assignCompanyPlan(id, dto);
  }

  @Post('companies/:id/custom-plan')
  @ApiOperation({ summary: 'Crear plan CUSTOM para una empresa' })
  createCompanyCustom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCustomPlanDto,
  ) {
    return this.plansAdmin.createCompanyCustomPlan(id, dto);
  }
}
