import { IsBoolean, IsInt, IsString, Max, Min, MinLength } from 'class-validator';

// Full replace, same convention as UpdateCompanyDto — and deliberately no
// "leave password unchanged" option: keeping that would require decrypting
// the stored password just to re-verify() it on every unrelated field edit
// (e.g. toggling `secure`). Re-entering the app password on every save is a
// rare, small cost that keeps this DTO and MailSettingsService simple, and
// means the plaintext password is never persisted without being freshly
// verified against the real SMTP server first.
export class UpdateMailSettingsDto {
  @IsString()
  @MinLength(1)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsBoolean()
  secure: boolean;

  @IsString()
  @MinLength(1)
  user: string;

  @IsString()
  @MinLength(1)
  password: string;
}
