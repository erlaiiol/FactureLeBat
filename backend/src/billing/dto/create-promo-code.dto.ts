import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

// code is optional on input — PromoCodeService generates a random one when
// omitted (see promo-code-generator.util.ts) so an admin can create a code
// with a single click, but can still hand-pick a memorable one (e.g.
// "SALON2026") for marketing use.
export class CreatePromoCodeDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{4,32}$/, {
    message:
      'Le code doit contenir 4 à 32 caractères parmi lettres majuscules, chiffres et tirets.',
  })
  code?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
