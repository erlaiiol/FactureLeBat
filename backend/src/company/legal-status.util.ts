import { LegalStatus } from '../../generated/prisma/enums';

// A micro-entrepreneur benefits from the French VAT exemption threshold
// ("franchise en base de TVA", art. 293 B du CGI) and does not charge VAT.
// A regular company always charges VAT in this simplified model.
export function isVatApplicable(legalStatus: LegalStatus): boolean {
  return legalStatus !== LegalStatus.MICRO_ENTREPRENEUR;
}
