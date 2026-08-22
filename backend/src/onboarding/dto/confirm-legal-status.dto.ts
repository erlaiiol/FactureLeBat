import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LegalStatus } from '../../../generated/prisma/enums';

export class ConfirmLegalStatusDto {
  @IsEnum(LegalStatus)
  legalStatus: LegalStatus;

  // Same bound as UpdateCompanyDto.vatRateBasisPoints. Omitted when
  // legalStatus is MICRO_ENTREPRENEUR (franchise en base — no rate to set);
  // OnboardingRepository falls back to the company's existing rate.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  vatRateBasisPoints?: number;
}
