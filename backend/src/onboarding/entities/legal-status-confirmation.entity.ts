import { LegalStatus } from '../../../generated/prisma/enums';

export interface LegalStatusConfirmation {
  legalStatus: LegalStatus;
  vatRateBasisPoints: number;
  legalStatusConfirmedAt: Date;
}
