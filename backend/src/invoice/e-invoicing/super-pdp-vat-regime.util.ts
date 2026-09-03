import { DeclarationFrequency, LegalStatus } from '../../../generated/prisma/enums';
import { isVatApplicable } from '../../company/legal-status.util';
import { SuperPdpVatRegime } from './super-pdp-client.service';

// Phase 1.2-8 (2026 e-invoicing reform): maps FactureLe's own VAT data
// model onto SUPER PDP's `vat_regime` enum (monthly/quarterly/simplified/
// vat_exemption — PATCH /v1.beta/companies). FactureLe never models
// "simplifié d'imposition" (régime simplifié) as its own concept — only
// réel normal mensuel/trimestriel (DeclarationFrequency) and franchise en
// base (legal-status.util.ts's isVatApplicable) — so `simplified` is not a
// value this mapping ever produces; that's accurate to what this app
// actually tracks, not an omission.
export function resolveSuperPdpVatRegime(
  legalStatus: LegalStatus,
  declarationFrequency: DeclarationFrequency,
): SuperPdpVatRegime {
  if (!isVatApplicable(legalStatus)) {
    return 'vat_exemption';
  }
  return declarationFrequency === DeclarationFrequency.MENSUELLE ? 'monthly' : 'quarterly';
}
