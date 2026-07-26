import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PushPlatform } from '../../../generated/prisma/enums';

// Sent once by the Capacitor app right after @capacitor/push-notifications
// resolves an FCM registration token (both platforms produce one — see
// push-sender.service.ts for why iOS is FCM too, not raw APNs).
export class RegisterPushDeviceDto {
  @IsEnum(PushPlatform)
  platform: PushPlatform;

  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;
}
