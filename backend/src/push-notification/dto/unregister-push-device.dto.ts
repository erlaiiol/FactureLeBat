import { IsString, MaxLength, MinLength } from 'class-validator';

// A body, not a :token route param: FCM tokens can run past 200 characters
// (RegisterPushDeviceDto allows up to 4096) — too long to be a sane URL
// path segment, so unregister takes the token the same way register does.
export class UnregisterPushDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;
}
