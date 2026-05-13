import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Notificaciones in-app (Prisma `Notification`) y hooks hacia push/email (stubs).
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
