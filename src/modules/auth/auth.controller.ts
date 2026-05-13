import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserResponseDto } from './dto/auth-user-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';

@ApiTags('auth')
@ApiBearerAuth('supabase-jwt')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({
    summary: 'Sincronizar usuario Supabase con PostgreSQL (JIT)',
  })
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  @ApiResponse({
    status: 401,
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 400,
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async syncUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncUserDto,
    @Req() request: Request,
  ): Promise<AuthUserResponseDto> {
    const result = await this.authService.syncUser(user, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });

    request.res?.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return {
      id: result.user.id,
      supabaseUid: result.user.supabaseUid,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
    };
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar sesión e invalidar token en Redis blocklist',
  })
  @ApiResponse({ status: 200, type: LogoutResponseDto })
  @ApiResponse({
    status: 401,
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async logout(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LogoutResponseDto> {
    const authorization = request.headers.authorization;
    const rawToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

    await this.authService.logout(rawToken, user);

    return { message: 'Logout exitoso. Token invalidado.' };
  }
}
