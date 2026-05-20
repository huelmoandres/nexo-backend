import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { StorageModule } from '@modules/storage/storage.module';
import { RolesGuard } from './guards/roles.guard';
import { RutRegistrationService } from './services/rut-registration.service';
import { UsersCompanyService } from './services/users-company.service';
import { UsersProfileService } from './services/users-profile.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AuthorizationModule, StorageModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    RutRegistrationService,
    UsersProfileService,
    UsersCompanyService,
    RolesGuard,
  ],
})
export class UsersModule {}
