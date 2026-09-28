import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// currentPassword is optional at the DTO level for the same reason as
// DeleteAccountDto.password: a Google/Apple-only account (no passwordHash)
// has nothing to re-confirm with, and this route doubles as how such an
// account sets a first password — see AuthService.changePassword.
export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  currentPassword?: string;

  // Same strength rules as RegisterDto.password.
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  @MaxLength(200)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule et un chiffre.',
  })
  newPassword: string;
}
