import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanySuperPdpService } from '../invoice/e-invoicing/company-super-pdp.service';
import { SuperPdpClientService } from '../invoice/e-invoicing/super-pdp-client.service';
import { ReceivedInvoiceModel as ReceivedInvoice } from '../../generated/prisma/models';
import { toReceivedInvoiceData } from './received-invoice-mapper.util';
import { ReceivedInvoiceRepository } from './received-invoice.repository';

// Generous but finite — a runaway loop (e.g. a `has_after` bug on SUPER
// PDP's side) stops after 2,000 invoices synced in one call rather than
// hanging the request forever. A single small-artisan company backlog is
// never remotely close to this in practice.
const MAX_SYNC_PAGES = 20;

// Phase 1.2-5 (2026 e-invoicing reform): the reception inbox's own
// orchestration — sync from SUPER PDP into ReceivedInvoice, list what's
// stored, and proxy a document download live (never cached, see
// ReceivedInvoice's own schema.prisma comment).
@Injectable()
export class ReceivedInvoiceService {
  constructor(
    private readonly repository: ReceivedInvoiceRepository,
    private readonly companySuperPdp: CompanySuperPdpService,
    private readonly superPdpClient: SuperPdpClientService,
  ) {}

  list(companyId: string): Promise<ReceivedInvoice[]> {
    return this.repository.findAll(companyId);
  }

  // On-demand only — no background poller/webhook yet (SUPER PDP's public
  // spec documents no webhook mechanism at all, see docs/roadmap.md Phase
  // 1.2-5's own Notes), same "manual refresh action" posture as Phase
  // 1.2-4's transmission-status endpoint.
  async sync(companyId: string): Promise<ReceivedInvoice[]> {
    const accessToken = await this.companySuperPdp.getValidAccessToken(companyId);
    let cursor = (await this.repository.findMaxSuperPdpInvoiceId(companyId)) ?? undefined;

    for (let page = 0; page < MAX_SYNC_PAGES; page++) {
      const { invoices, hasAfter } = await this.superPdpClient.listIncomingInvoices({
        accessToken,
        startingAfterId: cursor,
      });
      if (invoices.length > 0) {
        await this.repository.upsertMany(companyId, invoices.map(toReceivedInvoiceData));
        cursor = String(invoices[invoices.length - 1].id);
      }
      if (!hasAfter) {
        break;
      }
    }

    return this.list(companyId);
  }

  async downloadDocument(companyId: string, id: string): Promise<Buffer> {
    const received = await this.repository.findById(companyId, id);
    if (!received) {
      throw new NotFoundException('Facture reçue introuvable.');
    }
    const accessToken = await this.companySuperPdp.getValidAccessToken(companyId);
    return this.superPdpClient.downloadInvoiceDocument({
      accessToken,
      superPdpInvoiceId: received.superPdpInvoiceId,
    });
  }
}
