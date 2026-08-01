import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PlanTier } from '../../../generated/prisma/enums';

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

  // Phase 30: which tier this code grants — no default, an admin must
  // choose explicitly (the frontend form preselects Premium).
  @IsEnum(PlanTier)
  planTier: PlanTier;

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
