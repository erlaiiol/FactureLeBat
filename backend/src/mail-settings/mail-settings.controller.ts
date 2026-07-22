import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { MailSettings } from './entities/mail-settings.entity';
import { MailSettingsService } from './mail-settings.service';

@Controller('mail-settings')
export class MailSettingsController {
  constructor(private readonly mailSettingsService: MailSettingsService) {}

  @Get()
  getSettings(): Promise<MailSettings> {
    return this.mailSettingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateMailSettingsDto): Promise<MailSettings> {
    return this.mailSettingsService.updateSettings(dto);
  }
}
