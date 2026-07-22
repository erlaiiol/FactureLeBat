import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  InvoiceModel as Invoice,
  InvoiceLineModel as InvoiceLine,
  InvoiceServiceLineModel as InvoiceServiceLine,
  InvoiceServiceLineWeightModel as InvoiceServiceLineWeight,
  ManualInvoiceColumnModel as ManualInvoiceColumn,
  ManualInvoiceRowModel as ManualInvoiceRow,
  ManualInvoiceCellModel as ManualInvoiceCell,
  InvoiceCustomerFieldModel as InvoiceCustomerField,
  CompanyModel as Company,
} from '../../generated/prisma/models';
import {
  Unit,
  WasteSurcharge,
  ServiceVisibility,
  InvoiceEntryMode,
  ManualColumnRole,
} from '../../generated/prisma/enums';

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[];
  serviceLines: (InvoiceServiceLine & { weights: InvoiceServiceLineWeight[] })[];
  manualColumns: ManualInvoiceColumn[];
  manualRows: (ManualInvoiceRow & { cells: ManualInvoiceCell[] })[];
  customerFields: InvoiceCustomerField[];
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
  productCode?: string;
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

// Phase 9.5: one column of a MANUAL invoice's free-form table. Positional
// cells on CreateManualRowData below are aligned with this array's order.
export interface CreateManualColumnData {
  role: ManualColumnRole;
  label: string;
  widthPx?: number;
}

export interface CreateManualRowData {
  heightPx?: number;
  // Positional, aligned with CreateInvoiceData.manualColumns (cells[i]
  // targets manualColumns[i]) — same convention as service-line weights.
  cells: string[];
}

// A freehand extra client field (e.g. "SIRET") — see InvoiceCustomerField.
export interface CreateInvoiceCustomerFieldData {
  label: string;
  value: string;
}

export interface CreateInvoiceData {
  companyId: string;
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  customerFields: CreateInvoiceCustomerFieldData[];
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  // Phase 9.5 bis: manual mode's freely overridable aggregate figures — see
  // schema.prisma's comment on Invoice.subtotalOverrideCents. Always
  // undefined for entryMode GUIDED (enforced at the DTO boundary).
  subtotalOverrideCents?: number;
  vatOverrideCents?: number;
  totalOverrideCents?: number;
  entryMode: InvoiceEntryMode;
  lines: CreateInvoiceLineData[];
  serviceLines: CreateInvoiceServiceLineData[];
  // Only present for entryMode MANUAL — mutually exclusive with lines/
  // serviceLines above (enforced at the DTO boundary, see
  // ManualModeFieldsConsistency).
  manualColumns?: CreateManualColumnData[];
  manualRows?: CreateManualRowData[];
}

const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  serviceLines: { orderBy: { position: 'asc' }, include: { weights: true } },
  manualColumns: { orderBy: { position: 'asc' } },
  manualRows: { orderBy: { position: 'asc' }, include: { cells: true } },
  customerFields: { orderBy: { position: 'asc' } },
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
  // the invoice lines above, so those ids must exist first. Phase 9.5's
  // manual columns/rows/cells follow the same shape of constraint: a cell
  // references the *generated* id of a column created alongside the invoice,
  // so columns are created first (nested in the invoice.create() call
  // itself, like lines above), then rows-with-cells are created afterward,
  // positionally matched to those columns. A final re-read (still inside the
  // transaction, so it sees an atomic, fully-formed invoice or none at all)
  // returns the shape InvoiceMapper needs.
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
          subtotalOverrideCents: data.subtotalOverrideCents,
          vatOverrideCents: data.vatOverrideCents,
          totalOverrideCents: data.totalOverrideCents,
          entryMode: data.entryMode,
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
              productCode: line.productCode,
            })),
          },
          manualColumns: {
            create: (data.manualColumns ?? []).map((column, index) => ({
              position: index,
              role: column.role,
              label: column.label,
              widthPx: column.widthPx,
            })),
          },
          customerFields: {
            create: data.customerFields.map((field, index) => ({
              position: index,
              label: field.label,
              value: field.value,
            })),
          },
        },
        include: {
          lines: { orderBy: { position: 'asc' } },
          manualColumns: { orderBy: { position: 'asc' } },
        },
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

      for (const [index, row] of (data.manualRows ?? []).entries()) {
        await tx.manualInvoiceRow.create({
          data: {
            invoiceId: invoice.id,
            position: index,
            heightPx: row.heightPx,
            cells: {
              create: row.cells.map((value, columnIndex) => ({
                columnId: invoice.manualColumns[columnIndex].id,
                value,
              })),
            },
          },
        });
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

  // Phase 12: overwrites the last-send info rather than appending to a log
  // (see schema.prisma's comment on Invoice.sentAt) — a later successful
  // send simply means "yes, and most recently to this address".
  markSent(id: string, sentToEmail: string): Promise<InvoiceWithLines> {
    return this.prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date(), sentToEmail },
      include: INVOICE_INCLUDE,
    });
  }
}
