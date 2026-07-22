import { Module } from '@nestjs/common';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';
import { MailSettingsRepository } from './mail-settings.repository';

@Module({
  controllers: [MailSettingsController],
  providers: [MailSettingsService, MailSettingsRepository],
  exports: [MailSettingsService],
})
export class MailSettingsModule {}
