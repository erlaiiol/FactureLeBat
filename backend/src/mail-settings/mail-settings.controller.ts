import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { MailSettings } from './entities/mail-settings.entity';
import { MailSettingsService } from './mail-settings.service';

@Controller('mail-settings')
export class MailSettingsController {
  constructor(private readonly mailSettingsService: MailSettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser): Promise<MailSettings> {
    return this.mailSettingsService.getSettings(user.companyId);
  }

  @Patch()
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMailSettingsDto,
  ): Promise<MailSettings> {
    return this.mailSettingsService.updateSettings(user.companyId, dto);
  }
}
