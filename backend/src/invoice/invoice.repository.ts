import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  InvoiceModel as Invoice,
  InvoiceLineModel as InvoiceLine,
  InvoiceServiceLineModel as InvoiceServiceLine,
  InvoiceServiceLineWeightModel as InvoiceServiceLineWeight,
  CompanyModel as Company,
} from '../../generated/prisma/models';
import { Unit, WasteSurcharge, ServiceVisibility } from '../../generated/prisma/enums';

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[];
  serviceLines: (InvoiceServiceLine & { weights: InvoiceServiceLineWeight[] })[];
  company: Company;
};

export interface CreateInvoiceLineData {
  description: string;
  unit: Unit;
  quantity: number;
  unitPriceCents: number;
  wasteSurcharge: WasteSurcharge;
  packagingQuantity?: number;
  roundUpToPackaging: boolean;
}

export interface CreateInvoiceServiceLineData {
  serviceId?: string;
  name: string;
  description?: string;
  amountCents: number;
  visibility: ServiceVisibility;
  // Present iff visibility === REDISTRIBUTED, positional/aligned with the
  // `lines` array above (weights[i] targets the line created from lines[i]).
  // An EQUAL split has already been expanded into an explicit weight of 1
  // per line by the time this reaches the repository (see InvoiceService.create).
  weights?: number[];
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
  serviceLines: CreateInvoiceServiceLineData[];
}

const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  serviceLines: { orderBy: { position: 'asc' }, include: { weights: true } },
  company: true,
} as const;

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Increments the company's invoice counter and creates the invoice in the
  // same transaction: the row lock taken by the UPDATE serializes concurrent
  // invoice creation, keeping numbering sequential and gapless.
  //
  // Service lines and their redistribution weights are created after the
  // invoice + product lines, still inside the same transaction: a
  // REDISTRIBUTED service line's weights reference the *generated* ids of
  // the invoice lines above, so those ids must exist first. A final re-read
  // (still inside the transaction, so it sees an atomic, fully-formed
  // invoice or none at all) returns the shape InvoiceMapper needs.
  async createWithSequentialNumber(data: CreateInvoiceData): Promise<InvoiceWithLines> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: data.companyId },
        data: { nextInvoiceNumber: { increment: 1 } },
      });
      const usedNumber = company.nextInvoiceNumber - 1;
      const number = `${company.invoiceNumberPrefix}-${String(usedNumber).padStart(6, '0')}`;

      const invoice = await tx.invoice.create({
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
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              wasteSurcharge: line.wasteSurcharge,
              packagingQuantity: line.packagingQuantity,
              roundUpToPackaging: line.roundUpToPackaging,
            })),
          },
        },
        include: { lines: { orderBy: { position: 'asc' } } },
      });

      for (const [index, serviceLine] of data.serviceLines.entries()) {
        const createdServiceLine = await tx.invoiceServiceLine.create({
          data: {
            invoiceId: invoice.id,
            position: index,
            serviceId: serviceLine.serviceId,
            name: serviceLine.name,
            description: serviceLine.description,
            amountCents: serviceLine.amountCents,
            visibility: serviceLine.visibility,
          },
        });

        if (serviceLine.visibility === 'REDISTRIBUTED') {
          await tx.invoiceServiceLineWeight.createMany({
            data: serviceLine.weights!.map((weight, lineIndex) => ({
              invoiceServiceLineId: createdServiceLine.id,
              invoiceLineId: invoice.lines[lineIndex].id,
              weight,
            })),
          });
        }
      }

      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: INVOICE_INCLUDE });
    });
  }

  findById(id: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  }

  // Capped rather than paginated for now (Phase 1 has no list UI pagination
  // yet) — this bounds query cost and response size as invoices accumulate
  // instead of ever fetching an unbounded table. Revisit with real
  // pagination (cursor/offset + a `take`/`skip` param) once the artisan has
  // enough history that "most recent 200" stops being everything.
  private static readonly MAX_LISTED_INVOICES = 200;

  findAll(): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      include: INVOICE_INCLUDE,
      orderBy: { date: 'desc' },
      take: InvoiceRepository.MAX_LISTED_INVOICES,
    });
  }
}
