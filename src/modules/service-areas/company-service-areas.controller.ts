import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { CreateServiceAreaDto } from './dto/create-service-area.dto';
import { ServiceAreaResponseDto } from './dto/service-area-response.dto';
import { UpdateServiceAreaDto } from './dto/update-service-area.dto';
import { ServiceAreaService } from './service-area.service';

@ApiTags('service-areas')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN)
@Controller('companies/:companyId/service-areas')
export class CompanyServiceAreasController {
  constructor(private readonly serviceAreas: ServiceAreaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar zonas de servicio de la empresa' })
  @ApiResponse({ status: 200, type: [ServiceAreaResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ): Promise<ServiceAreaResponseDto[]> {
    return this.serviceAreas.listForCompany(user.sub, companyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear zona de servicio de empresa' })
  @ApiResponse({ status: 201, type: ServiceAreaResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    return this.serviceAreas.createForCompany(user.sub, companyId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar zona de empresa' })
  @ApiResponse({ status: 200, type: ServiceAreaResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    return this.serviceAreas.updateForCompany(user.sub, companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar zona de empresa' })
  @ApiResponse({ status: 204 })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.serviceAreas.deleteForCompany(user.sub, companyId, id);
  }
}
