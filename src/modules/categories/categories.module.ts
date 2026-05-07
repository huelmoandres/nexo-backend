import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationService } from '@modules/users/services/authorization.service';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  imports: [
    AuthModule, // provee REDIS_AUTH_CLIENT y SupabaseAuthGuard
  ],
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    CategoriesRepository,
    AuthorizationService, // para RolesGuard (PrismaService es global)
    RolesGuard,
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}
