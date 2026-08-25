import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReceivedInvoiceModel as ReceivedInvoice } from '../../generated/prisma/models';

export interface UpsertReceivedInvoiceData {
  superPdpInvoiceId: string;
  issuerName: string | null;
  issuerSiret: string | null;
  number: string | null;
  issueDate: Date | null;
  totalInclVatCents: number | null;
  vatAmountCents: number | null;
  currencyCode: string | null;
}

@Injectable()
export class ReceivedInvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string): Promise<ReceivedInvoice[]> {
    return this.prisma.receivedInvoice.findMany({
      where: { companyId },
      orderBy: { issueDate: 'desc' },
    });
  }

  findById(companyId: string, id: string): Promise<ReceivedInvoice | null> {
    return this.prisma.receivedInvoice.findFirst({ where: { id, companyId } });
  }

  // Phase 1.3-6 (2026 e-invoicing reform, workflow automation): the
  // Activity Analytics compliance snapshot's own received-invoice figure —
  // a plain count, never the documents themselves (same "consultation only"
  // boundary Phase 1.2-5 already draws around this table). Windowed by
  // receivedAt (never null, unlike issueDate which SUPER PDP doesn't always
  // supply) rather than issueDate — this is an activity count ("how many
  // did I receive this period"), not a legal-risk one.
  countInRange(companyId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.receivedInvoice.count({
      where: { companyId, receivedAt: { gte: from, lte: to } },
    });
  }

  // The highest superPdpInvoiceId already synced for this company, as a
  // number — SuperPdpClientService.listIncomingInvoices sorts ascending by
  // id, so paging from here on the next sync never re-reads an invoice
  // already stored. Null when nothing has ever been synced yet (paging
  // starts from the beginning).
  async findMaxSuperPdpInvoiceId(companyId: string): Promise<string | null> {
    const rows = await this.prisma.receivedInvoice.findMany({
      where: { companyId },
      select: { superPdpInvoiceId: true },
    });
    if (rows.length === 0) {
      return null;
    }
    return rows
      .map((row) => BigInt(row.superPdpInvoiceId))
      .reduce((max, current) => (current > max ? current : max))
      .toString();
  }

  // Upsert keyed on the (companyId, superPdpInvoiceId) unique constraint —
  // a sync that's re-run (e.g. after a partial failure) never duplicates an
  // invoice already stored.
  async upsertMany(companyId: string, invoices: UpsertReceivedInvoiceData[]): Promise<void> {
    for (const invoice of invoices) {
      await this.prisma.receivedInvoice.upsert({
        where: {
          companyId_superPdpInvoiceId: { companyId, superPdpInvoiceId: invoice.superPdpInvoiceId },
        },
        create: { companyId, ...invoice },
        update: invoice,
      });
    }
  }
}
