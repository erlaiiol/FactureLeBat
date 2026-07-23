import { IsOptional, IsString, MinLength } from 'class-validator';

// password is optional at the DTO level because a Google-only account
// (no passwordHash) has nothing to re-confirm with — see
// AuthService.deleteAccount for how the two cases are actually handled.
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
