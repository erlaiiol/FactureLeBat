import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EInvoiceTransmissionStatus } from '../../../generated/prisma/enums';
import { InvoiceWithTotals } from '../entities/invoice.entity';
import { FacturXService } from '../facturx/facturx.service';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository } from '../invoice.repository';
import { InvoiceService } from '../invoice.service';
import { PdfService } from '../pdf/pdf.service';
import { CompanySuperPdpService } from './company-super-pdp.service';
import { SuperPdpProvider } from './super-pdp-provider.service';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';

// Orchestrates one FACTURE's trip through the connected PA: generate the
// Factur-X hybrid (Phase 1.2-3, reusing InvoiceService.getPdfData so the
// transmitted file includes the same logo/signature a manual download
// would), submit it (Phase 1.2-4), persist the resulting status.
// Deliberately thin — every "how do I talk to a PA" concern lives behind
// SuperPdpProvider/ElectronicInvoicingProvider, so a future second PA
// option only changes what gets injected here, not this class's own logic.
@Injectable()
export class EInvoiceTransmissionService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly invoiceMapper: InvoiceMapper,
    private readonly pdfService: PdfService,
    private readonly facturXService: FacturXService,
    private readonly companySuperPdp: CompanySuperPdpService,
    private readonly provider: SuperPdpProvider,
  ) {}

  async transmit(companyId: string, invoiceId: string): Promise<InvoiceWithTotals> {
    const invoice = await this.invoiceService.findById(companyId, invoiceId);
    if (invoice.documentType !== 'FACTURE') {
      throw new BadRequestException(
        "La transmission électronique n'est disponible que pour une FACTURE, pas un DEVIS.",
      );
    }
    // Bug fix (2026-08-25 pipeline review + Phase 1.3-3): backend-level
    // backstop against re-transmitting an invoice SUPER PDP already has a
    // live copy of — the frontend already gates the manual button on this
    // same NOT_SENT/REJECTED rule (see InvoiceListRowComponent.canTransmit),
    // but a stale tab, a double-click race, or the new auto-transmit cron
    // sweep firing at the same moment as a manual click all reach this
    // service directly, bypassing that UI gate entirely.
    if (
      invoice.eInvoiceTransmissionStatus !== EInvoiceTransmissionStatus.NOT_SENT &&
      invoice.eInvoiceTransmissionStatus !== EInvoiceTransmissionStatus.REJECTED
    ) {
      throw new ConflictException('Cette facture a déjà été transmise à la plateforme agréée.');
    }

    const pdfData = await this.invoiceService.getPdfData(companyId, invoiceId);
    const pdfBuffer = await this.pdfService.generateInvoicePdf(pdfData);
    const hybridBuffer = await this.facturXService.generateHybridPdf(pdfBuffer, pdfData);

    const accessToken = await this.companySuperPdp.getValidAccessToken(companyId);
    const { providerReference } = await this.provider.transmit({
      accessToken,
      pdfBuffer: hybridBuffer,
      externalId: invoiceId,
    });

    const updated = await this.invoiceRepository.updateEInvoiceTransmission(companyId, invoiceId, {
      status: EInvoiceTransmissionStatus.SENT,
      transmittedAt: new Date(),
      superPdpInvoiceId: providerReference,
      rejectionReason: null,
    });
    return this.invoiceMapper.toInvoiceWithTotals(updated);
  }

  // Re-fetches the latest status from the PA and persists it — called
  // on-demand (a refresh action on the invoice board) rather than polled in
  // the background; SUPER PDP's own processing is asynchronous, so "just
  // submitted" and "already accepted" can both be true readings a few
  // seconds apart depending on when the artisan looks.
  async refreshStatus(companyId: string, invoiceId: string): Promise<InvoiceWithTotals> {
    // Raw repository read, not InvoiceService.findById/InvoiceWithTotals —
    // superPdpInvoiceId is an internal PA reference, deliberately not
    // exposed on the frontend-facing entity (see its own schema.prisma
    // comment: "opaque to the rest of the app").
    const invoice = await this.invoiceRepository.findById(companyId, invoiceId);
    if (!invoice?.superPdpInvoiceId) {
      throw new SuperPdpUnavailableError('This invoice has not been transmitted yet');
    }

    const accessToken = await this.companySuperPdp.getValidAccessToken(companyId);
    const { status, rejectionReason } = await this.provider.getStatus({
      accessToken,
      providerReference: invoice.superPdpInvoiceId,
    });

    const updated = await this.invoiceRepository.updateEInvoiceTransmission(companyId, invoiceId, {
      status,
      rejectionReason,
    });
    return this.invoiceMapper.toInvoiceWithTotals(updated);
  }
}
