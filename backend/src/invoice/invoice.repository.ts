import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import {
  InvoiceModel as Invoice,
  InvoiceLineModel as InvoiceLine,
  InvoiceServiceLineModel as InvoiceServiceLine,
  InvoiceServiceLineWeightModel as InvoiceServiceLineWeight,
  InvoiceDiscountLineModel as InvoiceDiscountLine,
  ManualInvoiceColumnModel as ManualInvoiceColumn,
  ManualInvoiceRowModel as ManualInvoiceRow,
  ManualInvoiceCellModel as ManualInvoiceCell,
  InvoiceCustomerFieldModel as InvoiceCustomerField,
  CompanyModel as Company,
} from '../../generated/prisma/models';
import {
  ActivityCategory,
  Unit,
  WasteSurcharge,
  ServiceVisibility,
  InvoiceEntryMode,
  ManualColumnRole,
  DocumentType,
  InvoiceStatus,
} from '../../generated/prisma/enums';
import { computeNextDocumentNumber } from './next-number.util';

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[];
  serviceLines: (InvoiceServiceLine & { weights: InvoiceServiceLineWeight[] })[];
  discountLines: InvoiceDiscountLine[];
  manualColumns: ManualInvoiceColumn[];
  manualRows: (ManualInvoiceRow & { cells: ManualInvoiceCell[] })[];
  customerFields: InvoiceCustomerField[];
  company: Company;
  // Phase 14.3: set on a devis once it's been converted — the facture that
  // was created from it. Null for a facture, and for a devis never converted.
  convertedToFacture: { id: string; number: string } | null;
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
  // Phase 15: per-line PDF rendering toggles — see schema.prisma's comment
  // on InvoiceLine.showUnitDetail/showBillingDetail.
  showUnitDetail: boolean;
  showBillingDetail: boolean;
  // Phase 17: snapshotted from the picked catalog Product at the moment
  // this line was added — see schema.prisma's comment on
  // InvoiceLine.activityCategory.
  activityCategory?: ActivityCategory;
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
  // Phase 17: snapshotted from the picked catalog Service — see
  // schema.prisma's comment on InvoiceServiceLine.activityCategory.
  activityCategory?: ActivityCategory;
}

// Phase 32: a remise applied to the invoice — see schema.prisma's comment on
// InvoiceDiscountLine.
export interface CreateInvoiceDiscountLineData {
  discountId?: string;
  name: string;
  amountCents: number;
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
  // Phase 32: always empty for entryMode MANUAL (enforced at the DTO
  // boundary, see ManualModeFieldsConsistency).
  discountLines: CreateInvoiceDiscountLineData[];
  // Only present for entryMode MANUAL — mutually exclusive with lines/
  // serviceLines above (enforced at the DTO boundary, see
  // ManualModeFieldsConsistency).
  manualColumns?: CreateManualColumnData[];
  manualRows?: CreateManualRowData[];
  // Phase 14.3: which numbering pool/prefix this row draws its number from
  // — see Company.devisNumberPrefix/invoiceNumberPrefix. Set when this
  // facture was created by converting a devis (see
  // InvoiceService.convertToFacture) — never set for a devis itself or a
  // facture created from scratch.
  documentType: DocumentType;
  convertedFromDevisId?: string;
  // Phase 27: the artisan's own explicit number (validated + uniqueness-
  // checked by InvoiceService.create) — when absent, the repository derives
  // one itself (see createWithSequentialNumber / computeNextDocumentNumber).
  number?: string;
  // Phase 23: document-level PDF rendering toggle — see schema.prisma's
  // comment on Invoice.simplifiedDisplay.
  simplifiedDisplay: boolean;
}

const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  serviceLines: { orderBy: { position: 'asc' }, include: { weights: true } },
  discountLines: { orderBy: { position: 'asc' } },
  manualColumns: { orderBy: { position: 'asc' } },
  manualRows: { orderBy: { position: 'asc' }, include: { cells: true } },
  customerFields: { orderBy: { position: 'asc' } },
  company: true,
  convertedToFacture: { select: { id: true, number: true } },
} as const;

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Locks the company row and creates the invoice in the same transaction:
  // the row lock serializes concurrent invoice creation for this company, so
  // two concurrent requests can never derive (or race to claim) the same
  // number — whether that number is computed here or an artisan's own
  // explicit override.
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
      // Phase 27: `FOR UPDATE` takes the same row lock the old counter
      // increment used to, but no longer needs a value to write — the
      // prefix is all this reads, since the actual next number is derived
      // fresh from this company's existing invoices below (see
      // computeNextDocumentNumber's comment on why a stored counter can no
      // longer be the source of truth once an artisan can override a
      // number).
      const [company] = await tx.$queryRaw<
        { invoiceNumberPrefix: string; devisNumberPrefix: string }[]
      >`SELECT "invoiceNumberPrefix", "devisNumberPrefix" FROM "Company" WHERE id = ${data.companyId} FOR UPDATE`;

      let number = data.number;
      if (!number) {
        const existing = await tx.invoice.findMany({
          where: { companyId: data.companyId, documentType: data.documentType },
          select: { number: true },
        });
        const prefix =
          data.documentType === DocumentType.DEVIS
            ? company.devisNumberPrefix
            : company.invoiceNumberPrefix;
        number = computeNextDocumentNumber(
          prefix,
          existing.map((invoice) => invoice.number),
        );
      }

      const invoice = await tx.invoice.create({
        data: {
          number,
          documentType: data.documentType,
          convertedFromDevisId: data.convertedFromDevisId,
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
          simplifiedDisplay: data.simplifiedDisplay,
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
              showUnitDetail: line.showUnitDetail,
              showBillingDetail: line.showBillingDetail,
              activityCategory: line.activityCategory,
            })),
          },
          discountLines: {
            create: data.discountLines.map((discountLine, index) => ({
              position: index,
              discountId: discountLine.discountId,
              name: discountLine.name,
              amountCents: discountLine.amountCents,
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
            activityCategory: serviceLine.activityCategory,
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

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the invoice exists for someone else. This closes a gap that
  // predated Phase 13: companyId has existed on Invoice since Phase 1's
  // schema, but reads never actually filtered on it.
  findById(companyId: string, id: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findFirst({ where: { id, companyId }, include: INVOICE_INCLUDE });
  }

  // Phase 27: feeds computeNextDocumentNumber for the "next number" suggestion
  // (InvoiceService.getNextNumber) — outside any transaction/lock since it's
  // only ever a suggestion the artisan can freely overwrite, never the
  // authoritative value (see createWithSequentialNumber, which re-derives
  // this itself under a row lock at actual creation time).
  async findNumbers(companyId: string, documentType: DocumentType): Promise<string[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, documentType },
      select: { number: true },
    });
    return invoices.map((invoice) => invoice.number);
  }

  // Capped rather than paginated for now (Phase 1 has no list UI pagination
  // yet) — this bounds query cost and response size as invoices accumulate
  // instead of ever fetching an unbounded table. Revisit with real
  // pagination (cursor/offset + a `take`/`skip` param) once the artisan has
  // enough history that "most recent 200" stops being everything.
  private static readonly MAX_LISTED_INVOICES = 200;

  findAll(companyId: string): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: INVOICE_INCLUDE,
      orderBy: { date: 'desc' },
      take: InvoiceRepository.MAX_LISTED_INVOICES,
    });
  }

  // Phase 12: overwrites the last-send info rather than appending to a log
  // (see schema.prisma's comment on Invoice.sentAt) — a later successful
  // send simply means "yes, and most recently to this address". updateMany
  // (not update), same cross-tenant-safety reasoning as
  // CustomerRepository.update — see NoRowsAffectedError.
  //
  // Phase 16: `bumpReminder` also stamps lastReminderAt in the same write —
  // set by InvoiceMailService.send whenever the invoice is still NON_PAYEE
  // at send time, so "renvoyer un mail" tracking piggybacks on the exact
  // same pipeline call rather than a second endpoint/round-trip.
  async markSent(
    companyId: string,
    id: string,
    sentToEmail: string,
    { bumpReminder }: { bumpReminder: boolean },
  ): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: {
        sentAt: new Date(),
        sentToEmail,
        ...(bumpReminder ? { lastReminderAt: new Date() } : {}),
      },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.invoice.findFirstOrThrow({
      where: { id, companyId },
      include: INVOICE_INCLUDE,
    });
  }

  // Phase 16: drives both the drag/button status changes and a due-date-only
  // edit (status unchanged, new dueDate) — see InvoiceService.updateStatus
  // for the paidAt set/clear logic this is handed. Same updateMany +
  // NoRowsAffectedError cross-tenant pattern as markSent above.
  async updateStatus(
    companyId: string,
    id: string,
    data: { status: InvoiceStatus; dueDate?: Date | null; paidAt: Date | null },
  ): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: {
        status: data.status,
        paidAt: data.paidAt,
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.invoice.findFirstOrThrow({
      where: { id, companyId },
      include: INVOICE_INCLUDE,
    });
  }

  // Phase 17: the quarterly report's own data source — a devis is never
  // "paid" (see InvoiceService.updateStatus's documentType guard, which
  // means a devis can never actually reach status PAYEE), but documentType
  // is still filtered explicitly here for the same defense-in-depth reason
  // findById filters companyId even though ids don't collide across tenants.
  // Reused for both the report's requested period and its year-to-date
  // plafond figure (see ReportsService) — no cap: a single period's paid
  // invoices for one small-artisan tenant is never remotely close to
  // MAX_LISTED_INVOICES.
  findPaidInRange(companyId: string, from: Date, to: Date): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: {
        companyId,
        documentType: DocumentType.FACTURE,
        status: InvoiceStatus.PAYEE,
        paidAt: { gte: from, lte: to },
      },
      include: INVOICE_INCLUDE,
      orderBy: { paidAt: 'asc' },
    });
  }

  // Phase 17: Activity Analytics' "outstanding" figure — every FACTURE still
  // owed, "En retard" included (it's the same NON_PAYEE status with a passed
  // dueDate, computed by the caller, never a separate persisted value — see
  // schema.prisma's comment on InvoiceStatus).
  findOutstanding(companyId: string): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: { companyId, documentType: DocumentType.FACTURE, status: InvoiceStatus.NON_PAYEE },
      include: INVOICE_INCLUDE,
      orderBy: { dueDate: 'asc' },
      take: InvoiceRepository.MAX_LISTED_INVOICES,
    });
  }
}
