import { Module } from '@nestjs/common';
import { PushNotificationController } from './push-notification.controller';
import { PushNotificationRepository } from './push-notification.repository';
import { PushNotificationService } from './push-notification.service';
import { PushSenderService } from './push-sender.service';
import { ReminderCronService } from './reminder-cron.service';

// Exports PushNotificationService (consumed by AdminModule for the
// devices-list/test-send admin surface, same import shape as
// SiteLegalModule) — ReminderCronService/PushSenderService/repository stay
// private, nothing outside this module needs the FCM boundary directly.
@Module({
  controllers: [PushNotificationController],
  providers: [
    PushNotificationService,
    PushNotificationRepository,
    PushSenderService,
    ReminderCronService,
  ],
  exports: [PushNotificationService],
})
export class PushNotificationModule {}
