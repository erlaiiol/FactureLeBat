import { EInvoiceTransmissionStatus } from '../../../generated/prisma/enums';

// Phase 1.2-4 (2026 e-invoicing reform): kept deliberately small and PA-
// agnostic — decided explicitly with the user while discussing PA choice
// (docs/roadmap.md Phase 1.2-4's Architecture note): "the PA must never sit
// at the center of FactureLe's own data model." `SuperPdpProvider` is the
// only implementation today, but nothing outside this interface (the
// controller, the transmit service) is allowed to know that — a future PA
// swap or a second PA option only ever means writing a new class against
// this same shape.
export interface TransmitResult {
  providerReference: string;
}

export interface TransmissionStatusResult {
  status: EInvoiceTransmissionStatus;
  rejectionReason: string | null;
}

export interface ElectronicInvoicingProvider {
  // Submits an already-generated Factur-X hybrid PDF for the invoice
  // identified by `externalId` (FactureLe's own Invoice.id) — returns the
  // provider's own opaque tracking reference, stored on
  // Invoice.superPdpInvoiceId and passed back into getStatus below, never
  // interpreted by anything outside the concrete provider implementation.
  transmit(params: {
    accessToken: string;
    pdfBuffer: Buffer;
    externalId: string;
  }): Promise<TransmitResult>;

  // Resolves the provider's own (possibly non-exclusive, event-log-shaped)
  // status representation into FactureLe's own EInvoiceTransmissionStatus
  // vocabulary — see super-pdp-status.util.ts for why this translation
  // exists at all rather than exposing the provider's raw status values.
  getStatus(params: {
    accessToken: string;
    providerReference: string;
  }): Promise<TransmissionStatusResult>;
}
