import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { PushNotificationService } from './push-notification.service';

// Artisan-facing only — the admin read/test-send surface lives on
// AdminController instead (same split as SiteLegalController's public GET
// vs. the admin PATCH folded elsewhere).
@Controller('push')
export class PushNotificationController {
  constructor(private readonly pushNotificationService: PushNotificationService) {}

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushDeviceDto,
  ): Promise<void> {
    return this.pushNotificationService.registerDevice(user.userId, dto.platform, dto.token);
  }

  // Called by the frontend right before logout, so a shared/reset device
  // stops receiving pushes meant for the departed account.
  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterPushDeviceDto,
  ): Promise<void> {
    return this.pushNotificationService.unregisterDevice(user.userId, dto.token);
  }
}
