import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  InvoiceModel as Invoice,
  InvoiceLineModel as InvoiceLine,
  CompanyModel as Company,
} from '../../generated/prisma/models';
import { LineMode, WasteSurcharge } from '../../generated/prisma/enums';

export type InvoiceWithLines = Invoice & { lines: InvoiceLine[]; company: Company };

export interface CreateInvoiceLineData {
  description: string;
  unit: string;
  mode: LineMode;
  quantity: number;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
}

export interface CreateInvoiceData {
  companyId: string;
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  lines: CreateInvoiceLineData[];
}

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Increments the company's invoice counter and creates the invoice in the
  // same transaction: the row lock taken by the UPDATE serializes concurrent
  // invoice creation, keeping numbering sequential and gapless.
  async createWithSequentialNumber(data: CreateInvoiceData): Promise<InvoiceWithLines> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: data.companyId },
        data: { nextInvoiceNumber: { increment: 1 } },
      });
      const usedNumber = company.nextInvoiceNumber - 1;
      const number = `${company.invoiceNumberPrefix}-${String(usedNumber).padStart(6, '0')}`;

      return tx.invoice.create({
        data: {
          number,
          companyId: data.companyId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          customerId: data.customerId,
          vatApplicable: data.vatApplicable,
          vatRateBasisPoints: data.vatRateBasisPoints,
          lines: {
            create: data.lines.map((line, index) => ({
              position: index,
              description: line.description,
              unit: line.unit,
              mode: line.mode,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              wasteSurcharge: line.wasteSurcharge,
            })),
          },
        },
        include: { lines: { orderBy: { position: 'asc' } }, company: true },
      });
    });
  }

  findById(id: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } }, company: true },
    });
  }

  // Capped rather than paginated for now (Phase 1 has no list UI pagination
  // yet) — this bounds query cost and response size as invoices accumulate
  // instead of ever fetching an unbounded table. Revisit with real
  // pagination (cursor/offset + a `take`/`skip` param) once the artisan has
  // enough history that "most recent 200" stops being everything.
  private static readonly MAX_LISTED_INVOICES = 200;

  findAll(): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      include: { lines: { orderBy: { position: 'asc' } }, company: true },
      orderBy: { date: 'desc' },
      take: InvoiceRepository.MAX_LISTED_INVOICES,
    });
  }
}
