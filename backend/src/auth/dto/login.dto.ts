import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  // Defaults true (see AuthService.login) — controls whether the refresh
  // cookie is persistent (30 days) or a browser session cookie cleared on
  // close (see docs/roadmap.md Phase 13).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
