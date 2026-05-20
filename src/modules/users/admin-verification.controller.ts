import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role, VerificationSubjectType } from '@prisma/client';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/interfaces/authenticated-user.interface';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { AdminReviewVerificationDto } from './dto/admin-review-verification.dto';
import { PendingVerificationItemDto } from './dto/pending-verification-item.dto';
import { VerificationStatusResponseDto } from './dto/verification-status-response.dto';
import { DgiVerificationService } from './services/dgi-verification.service';
import { UsersRepository } from './users.repository';

@ApiTags('admin')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/verification')
export class AdminVerificationController {
  constructor(
    private readonly dgiVerificationService: DgiVerificationService,
    private readonly usersRepository: UsersRepository,
  ) {}

  @Get('pending')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Cola de verificaciones DGI pendientes de revisión manual',
  })
  @ApiResponse({ status: 200, type: [PendingVerificationItemDto] })
  async listPending(): Promise<PendingVerificationItemDto[]> {
    return this.dgiVerificationService.listPendingForAdmin();
  }

  @Post(':subjectType/:subjectId/review')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar o rechazar verificación DGI manual' })
  @ApiParam({ name: 'subjectType', enum: VerificationSubjectType })
  @ApiParam({ name: 'subjectId', type: String })
  @ApiBody({ type: AdminReviewVerificationDto })
  @ApiResponse({ status: 200, type: VerificationStatusResponseDto })
  async review(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('subjectType') subjectType: VerificationSubjectType,
    @Param('subjectId') subjectId: string,
    @Body() dto: AdminReviewVerificationDto,
  ): Promise<VerificationStatusResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(
      authUser.sub,
    );
    if (!user) {
      throw new NotFoundException(
        buildProblem('USER_NOT_FOUND', 'Usuario no sincronizado.'),
      );
    }
    return this.dgiVerificationService.adminReview(
      subjectType,
      subjectId,
      dto,
      user.id,
    );
  }
}
