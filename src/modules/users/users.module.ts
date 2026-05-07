import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { StorageModule } from '@modules/storage/storage.module';
import { RolesGuard } from './guards/roles.guard';
import { AuthorizationService } from './services/authorization.service';
import { UsersCompanyService } from './services/users-company.service';
import { UsersProfileService } from './services/users-profile.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UsersProfileService,
    UsersCompanyService,
    AuthorizationService,
    RolesGuard,
  ],
})
export class UsersModule {}
