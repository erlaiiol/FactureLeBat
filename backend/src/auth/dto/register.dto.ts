import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(200)
  email: string;

  // Deliberately no upper MaxLength on the raw password beyond a sanity
  // bound — bcrypt silently truncates at 72 bytes, but rejecting a long
  // passphrase outright would punish an artisan who chose a strong one.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  // Hard requirement, not just documentation: a registration attempt that
  // doesn't tick this is rejected outright (see docs/roadmap.md Phase 13's
  // CGU/politique de confidentialité consent requirement).
  @Equals(true, { message: 'Vous devez accepter les CGU et la politique de confidentialité.' })
  acceptTerms: boolean;

  // Unchecked by default on the frontend — RGPD requires this stay a
  // separate, independent opt-in from acceptTerms above, never bundled.
  @IsOptional()
  @IsBoolean()
  newsletterOptIn?: boolean;

  // Phase 29: an unknown/invalid code is silently ignored (see
  // AuthService.register/ReferralService.attributeReferral) — a bad
  // referral code must never block account creation.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}
