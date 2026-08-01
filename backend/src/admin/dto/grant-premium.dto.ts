import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { PlanTier } from '../../../generated/prisma/enums';

// Phase 30: an admin grant now picks a tier explicitly instead of
// implicitly always meaning "premium" — see docs/roadmap.md Phase 30.
export class GrantPremiumDto {
  @IsEnum(PlanTier)
  tier: PlanTier;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;
}
