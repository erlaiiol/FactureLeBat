import { DeclarationFrequency, LegalStatus } from '../../../generated/prisma/enums';
import { resolveSuperPdpVatRegime } from './super-pdp-vat-regime.util';

describe('resolveSuperPdpVatRegime', () => {
  it('is vat_exemption for a micro-entrepreneur regardless of declaration frequency', () => {
    expect(
      resolveSuperPdpVatRegime(LegalStatus.MICRO_ENTREPRENEUR, DeclarationFrequency.MENSUELLE),
    ).toBe('vat_exemption');
    expect(
      resolveSuperPdpVatRegime(LegalStatus.MICRO_ENTREPRENEUR, DeclarationFrequency.TRIMESTRIELLE),
    ).toBe('vat_exemption');
  });

  it('is monthly for a regular company declaring monthly', () => {
    expect(resolveSuperPdpVatRegime(LegalStatus.COMPANY, DeclarationFrequency.MENSUELLE)).toBe(
      'monthly',
    );
  });

  it('is quarterly for a regular company declaring quarterly', () => {
    expect(resolveSuperPdpVatRegime(LegalStatus.COMPANY, DeclarationFrequency.TRIMESTRIELLE)).toBe(
      'quarterly',
    );
  });
});
