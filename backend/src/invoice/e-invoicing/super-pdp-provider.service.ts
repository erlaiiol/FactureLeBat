import { Injectable } from '@nestjs/common';
import {
  ElectronicInvoicingProvider,
  TransmissionStatusResult,
  TransmitResult,
} from './electronic-invoicing-provider.interface';
import { SuperPdpClientService } from './super-pdp-client.service';
import { latestRejectionReason, resolveTransmissionStatus } from './super-pdp-status.util';

// The only ElectronicInvoicingProvider implementation today (SUPER PDP,
// chosen in docs/roadmap.md Phase 1.2-1) — a thin adapter translating
// between the generic interface and SuperPdpClientService's own SUPER-PDP-
// shaped methods/types, so the raw client stays reusable if this app ever
// needs SUPER PDP calls outside the provider abstraction (it doesn't today).
@Injectable()
export class SuperPdpProvider implements ElectronicInvoicingProvider {
  constructor(private readonly client: SuperPdpClientService) {}

  async transmit(params: {
    accessToken: string;
    pdfBuffer: Buffer;
    externalId: string;
  }): Promise<TransmitResult> {
    const { superPdpInvoiceId } = await this.client.submitInvoice(params);
    return { providerReference: superPdpInvoiceId };
  }

  async getStatus(params: {
    accessToken: string;
    providerReference: string;
  }): Promise<TransmissionStatusResult> {
    const invoice = await this.client.getInvoice({
      accessToken: params.accessToken,
      superPdpInvoiceId: params.providerReference,
    });
    return {
      status: resolveTransmissionStatus(invoice.events),
      rejectionReason: latestRejectionReason(invoice.events),
    };
  }
}
