import { LegalStatus } from '../../generated/prisma/enums';
import { isVatApplicable } from './legal-status.util';

describe('isVatApplicable', () => {
  it('is not applicable for a micro-entrepreneur (franchise en base, art. 293 B du CGI)', () => {
    expect(isVatApplicable(LegalStatus.MICRO_ENTREPRENEUR)).toBe(false);
  });

  it('is applicable for a regular company', () => {
    expect(isVatApplicable(LegalStatus.COMPANY)).toBe(true);
  });
});
