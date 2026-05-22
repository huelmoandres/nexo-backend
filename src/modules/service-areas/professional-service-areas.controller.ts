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
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Role } from '@prisma/client';
import { Roles } from '@modules/authorization/roles.decorator';
import { RolesGuard } from '@modules/authorization/roles.guard';
import { CreateServiceAreaDto } from './dto/create-service-area.dto';
import { ServiceAreaResponseDto } from './dto/service-area-response.dto';
import { UpdateServiceAreaDto } from './dto/update-service-area.dto';
import { ServiceAreaService } from './service-area.service';

@ApiTags('service-areas')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.INDEPENDENT_PRO)
@Controller('professionals/me/service-areas')
export class ProfessionalServiceAreasController {
  constructor(private readonly serviceAreas: ServiceAreaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar zonas de servicio del profesional autenticado' })
  @ApiResponse({ status: 200, type: [ServiceAreaResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceAreaResponseDto[]> {
    return this.serviceAreas.listForCurrentProfessional(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear zona de servicio (valida plan)' })
  @ApiResponse({ status: 201, type: ServiceAreaResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    return this.serviceAreas.createForCurrentProfessional(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar zona de servicio' })
  @ApiResponse({ status: 200, type: ServiceAreaResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    return this.serviceAreas.updateForCurrentProfessional(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar zona de servicio' })
  @ApiResponse({ status: 204 })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.serviceAreas.deleteForCurrentProfessional(user.sub, id);
  }
}
