import { IsEnum } from 'class-validator';
import { PlanTier } from '../../../generated/prisma/enums';

// Phase 30: checkout now needs to know which of the 3 tiers to bill —
// previously implicit (there was only one price).
export class CreateCheckoutSessionDto {
  @IsEnum(PlanTier)
  tier: PlanTier;
}
