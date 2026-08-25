import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { generateOpaqueToken } from '../auth/token.util';
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
  SignatureMethod,
  NatureOperation,
  EInvoiceTransmissionStatus,
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
  // Set on a facture once a devis has been retroactively created from it —
  // see InvoiceService.convertToDevis. Null for a devis, and for a facture
  // with no retroactive devis.
  retroactiveDevis: { id: string; number: string } | null;
  // Phase 1.1-1: presence/method only — never the image bytes (see
  // InvoiceRepository.findSignatureImage for the one place those are read).
  signature: { method: SignatureMethod; createdAt: Date } | null;
  // Phase 1.1-7: isProfessional only — a live join, not a snapshot (see
  // schema.prisma's comment on Customer.isProfessional). Null when
  // customerId is unset or points at nothing this company still has (the
  // soft-reference case conventions.md already documents for
  // customerName/Address/Email/Phone) — InvoiceMapper treats either the
  // same as "not professional".
  customer: { isProfessional: boolean } | null;
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
  // Soft reference to the catalog Product this line was toggled on from —
  // see schema.prisma's comment on InvoiceLine.productId.
  productId?: string;
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
  // Phase 34: positional, aligned with CreateInvoiceData.lines/serviceLines
  // (targetLineIndex i means "scoped to the line created from lines[i]") —
  // resolved to the generated InvoiceLine/InvoiceServiceLine id once those
  // rows exist (see createWithSequentialNumber, which creates discountLines
  // last for exactly this reason). Mutually exclusive, both undefined means
  // this remise applies to the invoice's general total.
  targetLineIndex?: number;
  targetServiceLineIndex?: number;
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
  // Phase 1.1-8: see schema.prisma's comments on Invoice.customerSiret/
  // Invoice.deliveryAddress.
  customerSiret?: string;
  deliveryAddress?: string;
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
  // Set when this devis was created retroactively from an existing facture
  // (see InvoiceService.convertToDevis) — never set for a facture itself or
  // a devis created from scratch.
  createdFromFactureId?: string;
  // Phase 27: the artisan's own explicit number (validated + uniqueness-
  // checked by InvoiceService.create) — when absent, the repository derives
  // one itself (see createWithSequentialNumber / computeNextDocumentNumber).
  number?: string;
  // Phase 23: document-level PDF rendering toggle — see schema.prisma's
  // comment on Invoice.simplifiedDisplay.
  simplifiedDisplay: boolean;
  // Phase 1.1-3: the requested deposit — both undefined when none was
  // requested (never set together with the other, enforced by
  // DepositFieldsConsistency at the DTO boundary). See schema.prisma's
  // comment on Invoice.depositPercentageBasisPoints.
  depositPercentageBasisPoints?: number;
  depositAmountCents?: number;
  // Phase 1.1-7: FACTURE-only (enforced at the DTO boundary, see
  // ReverseChargeFactureOnly) — see schema.prisma's comment on
  // Invoice.reverseChargeApplicable.
  reverseChargeApplicable?: boolean;
  // Phase 1.1-8: MANUAL-only (enforced at the DTO boundary, see
  // ManualModeFieldsConsistency) — see schema.prisma's comment on
  // Invoice.manualNatureOfOperation.
  manualNatureOfOperation?: NatureOperation;
  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): set by
  // InvoiceService when Company.autoTransmitViaPa was on and SUPER PDP was
  // connected at creation time — undefined for every other case (manual
  // mode, a DEVIS, or auto-transmit off/not connected), leaving the column
  // NULL, never a meaningless default.
  scheduledTransmitAt?: Date;
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
  retroactiveDevis: { select: { id: true, number: true } },
  signature: { select: { method: true, createdAt: true } },
  // Phase 1.1-7: see InvoiceWithLines.customer's own comment.
  customer: { select: { isProfessional: true } },
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
  // positionally matched to those columns. Phase 34's discount lines are
  // created last, after both lines and service lines exist, for the same
  // reason: a targeted discount line's targetInvoiceLineId/
  // targetInvoiceServiceLineId reference whichever of those two was just
  // generated above. A final re-read (still inside the transaction, so it
  // sees an atomic, fully-formed invoice or none at all) returns the shape
  // InvoiceMapper needs.
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
          createdFromFactureId: data.createdFromFactureId,
          companyId: data.companyId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          customerSiret: data.customerSiret,
          deliveryAddress: data.deliveryAddress,
          customerId: data.customerId,
          vatApplicable: data.vatApplicable,
          vatRateBasisPoints: data.vatRateBasisPoints,
          subtotalOverrideCents: data.subtotalOverrideCents,
          vatOverrideCents: data.vatOverrideCents,
          totalOverrideCents: data.totalOverrideCents,
          entryMode: data.entryMode,
          simplifiedDisplay: data.simplifiedDisplay,
          depositPercentageBasisPoints: data.depositPercentageBasisPoints,
          depositAmountCents: data.depositAmountCents,
          reverseChargeApplicable: data.reverseChargeApplicable,
          manualNatureOfOperation: data.manualNatureOfOperation,
          scheduledTransmitAt: data.scheduledTransmitAt,
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
              productId: line.productId,
              showUnitDetail: line.showUnitDetail,
              showBillingDetail: line.showBillingDetail,
              activityCategory: line.activityCategory,
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

      // Phase 34: tracked positionally (createdServiceLineIds[i] is the id
      // generated for data.serviceLines[i]) so a discount line's
      // targetServiceLineIndex can be resolved to a real id below, the same
      // way invoice.lines[targetLineIndex].id resolves a line target.
      const createdServiceLineIds: string[] = [];
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
        createdServiceLineIds.push(createdServiceLine.id);

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

      // Phase 34: created last, after both lines and service lines above —
      // see this method's own doc comment for why a targeted discount line
      // needs those generated ids to already exist.
      for (const [index, discountLine] of data.discountLines.entries()) {
        await tx.invoiceDiscountLine.create({
          data: {
            invoiceId: invoice.id,
            position: index,
            discountId: discountLine.discountId,
            name: discountLine.name,
            amountCents: discountLine.amountCents,
            targetInvoiceLineId:
              discountLine.targetLineIndex !== undefined
                ? invoice.lines[discountLine.targetLineIndex].id
                : undefined,
            targetInvoiceServiceLineId:
              discountLine.targetServiceLineIndex !== undefined
                ? createdServiceLineIds[discountLine.targetServiceLineIndex]
                : undefined,
          },
        });
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

  // Phase 1.3-7 ("Partager"): the token itself is the credential — unlike
  // findById above, this is reached from a @Public() route with no
  // companyId at all, so it must never filter on one.
  findByShareToken(token: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findFirst({
      where: { shareToken: token },
      include: INVOICE_INCLUDE,
    });
  }

  // Lazily issues the token on first request rather than at creation time —
  // most invoices are never shared this way. Reuses auth/token.util's own
  // generator (256 bits, hex) for the same reason every other bearer token
  // in this app does: plenty of entropy to make guessing infeasible.
  // Deliberately NOT hashed before storage (unlike RefreshToken/AuthToken,
  // which protect single-use, short-lived, account-takeover-sensitive
  // secrets) — this token is meant to be looked up directly and to keep
  // working indefinitely, same threat model as an "anyone with the link"
  // Drive/Dropbox share, not a login credential.
  async getOrCreateShareToken(companyId: string, id: string): Promise<string> {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      select: { shareToken: true },
    });
    if (!existing) {
      throw new NoRowsAffectedError();
    }
    if (existing.shareToken) {
      return existing.shareToken;
    }
    const token = generateOpaqueToken();
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: { shareToken: token },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return token;
  }

  // The artisan's own "révoquer" action — the only way this token ever
  // stops working, since it has no expiry (see schema.prisma's comment on
  // Invoice.shareToken). A previously-shared link 404s from that point on;
  // a fresh call to getOrCreateShareToken issues a brand new one.
  async revokeShareToken(companyId: string, id: string): Promise<void> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: { shareToken: null },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
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
    data: {
      status: InvoiceStatus;
      dueDate?: Date | null;
      paidAt: Date | null;
      depositPaidAt: Date | null;
    },
  ): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: {
        status: data.status,
        paidAt: data.paidAt,
        depositPaidAt: data.depositPaidAt,
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

  // Phase 1.2-4 (2026 e-invoicing reform): written once right after
  // submitting to the PA (status SENT, superPdpInvoiceId set,
  // eInvoiceTransmittedAt now) and again every time the artisan refreshes
  // status from the PA (status/rejectionReason only, see
  // EInvoiceTransmissionService) — same updateMany-then-refetch shape as
  // updateStatus above.
  async updateEInvoiceTransmission(
    companyId: string,
    id: string,
    data: {
      status: EInvoiceTransmissionStatus;
      transmittedAt?: Date;
      superPdpInvoiceId?: string;
      rejectionReason: string | null;
    },
  ): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: {
        eInvoiceTransmissionStatus: data.status,
        eInvoiceRejectionReason: data.rejectionReason,
        ...(data.transmittedAt !== undefined ? { eInvoiceTransmittedAt: data.transmittedAt } : {}),
        ...(data.superPdpInvoiceId !== undefined
          ? { superPdpInvoiceId: data.superPdpInvoiceId }
          : {}),
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

  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation):
  // AutoTransmitCronService's own sweep source — cross-tenant, same
  // reasoning as ReminderCronService's own findReminderCounts. Only id/
  // companyId: the cron re-loads the full invoice through the normal
  // EInvoiceTransmissionService.transmit path per row, never builds a PDF
  // from this narrow projection itself.
  findDueForAutoTransmit(now: Date): Promise<{ id: string; companyId: string }[]> {
    return this.prisma.invoice.findMany({
      where: {
        scheduledTransmitAt: { lte: now },
        transmitCancelledAt: null,
        eInvoiceTransmissionStatus: EInvoiceTransmissionStatus.NOT_SENT,
      },
      select: { id: true, companyId: true },
    });
  }

  // Atomically claims one due row for transmission — nulls
  // scheduledTransmitAt gated on it still being set (and not cancelled),
  // so two overlapping cron ticks (a slow run bumping into the next
  // scheduled one) can never both proceed on the same invoice. Returns
  // false when another caller already claimed it; the sweep must skip
  // calling transmit() in that case. This is the load-bearing half of this
  // phase's double-transmission defense — the other half is
  // EInvoiceTransmissionService.transmit's own NOT_SENT/REJECTED status
  // guard, which additionally covers a manual click racing this claim.
  async claimAutoTransmit(companyId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId, scheduledTransmitAt: { not: null }, transmitCancelledAt: null },
      data: { scheduledTransmitAt: null },
    });
    return count === 1;
  }

  // The artisan's own "Annuler" action on a still-pending auto-transmission
  // — deliberately not gated on any precondition (already sent/already
  // cancelled): both are harmless to write again, so this never throws for
  // a "too late" click, only for a genuinely missing/foreign invoice id.
  // Clears scheduledTransmitAt in the same write so the frontend's
  // pendingAutoTransmit (scheduledTransmitAt non-null and in the future)
  // flips back to the manual "Envoyer via PA" state immediately.
  async cancelScheduledTransmit(companyId: string, id: string): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, companyId },
      data: { transmitCancelledAt: new Date(), scheduledTransmitAt: null },
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
  // schema.prisma's comment on InvoiceStatus). Phase 1.1-3: ACOMPTE_VERSE
  // included too — a deposit received doesn't mean the facture is settled,
  // there's still a balance owed (see ReportsService.getActivityAnalytics,
  // which nets out the deposit for this one status).
  findOutstanding(companyId: string): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: {
        companyId,
        documentType: DocumentType.FACTURE,
        status: { in: [InvoiceStatus.NON_PAYEE, InvoiceStatus.ACOMPTE_VERSE] },
      },
      include: INVOICE_INCLUDE,
      orderBy: { dueDate: 'asc' },
      take: InvoiceRepository.MAX_LISTED_INVOICES,
    });
  }

  // Phase 1.1-1: attaching a signature (drawn or photographed) replaces any
  // existing one for this document — upsert by invoiceId, same "only one
  // per document" rule as CompanyLogo's upsertLogo. Caller (InvoiceService)
  // has already confirmed the invoice belongs to this tenant.
  async upsertSignature(
    invoiceId: string,
    data: { image: Buffer; mimeType: string; method: SignatureMethod },
  ): Promise<InvoiceWithLines> {
    // Same Buffer-is-a-Uint8Array-at-runtime cast as CompanyRepository.
    // upsertLogo — works around Prisma 7's generated Bytes type being
    // pinned to Uint8Array<ArrayBuffer> specifically.
    const image = data.image as unknown as Uint8Array<ArrayBuffer>;
    await this.prisma.invoiceSignature.upsert({
      where: { invoiceId },
      create: { invoiceId, image, mimeType: data.mimeType, method: data.method },
      update: { image, mimeType: data.mimeType, method: data.method },
    });
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE,
    });
  }

  async deleteSignature(invoiceId: string): Promise<InvoiceWithLines> {
    await this.prisma.invoiceSignature.deleteMany({ where: { invoiceId } });
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE,
    });
  }

  // The one place InvoiceSignature.image is ever read — tenant-scoped in a
  // single query (via the invoice relation) rather than a separate
  // findRawById + lookup, since this is called on the hot PDF-generation
  // path too. Used by both GET /invoices/:id/signature and
  // InvoiceService.getPdfData.
  async findSignatureImage(
    companyId: string,
    invoiceId: string,
  ): Promise<{ image: Buffer; mimeType: string } | null> {
    const row = await this.prisma.invoiceSignature.findFirst({
      where: { invoiceId, invoice: { companyId } },
      select: { image: true, mimeType: true },
    });
    // Same Buffer.from-wraps-without-copying convention as
    // CompanyRepository.findLogo, for the same richer-Buffer-API reason
    // (InvoiceMapper.signatureField needs .toString('base64')).
    return row ? { image: Buffer.from(row.image), mimeType: row.mimeType } : null;
  }

  // The manual, freehand fallback (InvoiceService.setManuallySigned already
  // guards that a real InvoiceSignature isn't attached before calling this)
  // — same cross-tenant-safety updateMany + NoRowsAffectedError convention
  // as updateStatus/markSent above.
  async updateManuallySigned(
    companyId: string,
    invoiceId: string,
    manuallySigned: boolean,
  ): Promise<InvoiceWithLines> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, companyId },
      data: { manuallySigned },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, companyId },
      include: INVOICE_INCLUDE,
    });
  }

  // Phase 1.1-1 (Statistiques): every FACTURE with neither a real
  // InvoiceSignature nor the manual fallback checked — the "could have
  // repercussions" risk count surfaced on the analytics page (unpaid or
  // already paid alike, ANNULEE excluded since a cancelled facture carries
  // no such risk). Deliberately a plain count, not INVOICE_INCLUDE's full
  // shape — nothing here needs lines/serviceLines/etc.
  countUnsigned(companyId: string): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        companyId,
        documentType: DocumentType.FACTURE,
        status: { not: InvoiceStatus.ANNULEE },
        manuallySigned: false,
        signature: null,
      },
    });
  }

  // Phase 1.3-6 (2026 e-invoicing reform, workflow automation): the
  // compliance snapshot's own transmission-rate source — how many FACTUREs
  // exist in the analytics window (denominator) and how many of those are
  // no longer NOT_SENT (numerator). Two plain counts, not a groupBy: the
  // snapshot only ever needs one company's two numbers, not a cross-tenant
  // breakdown.
  countFacturesInRange(companyId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.invoice.count({
      where: { companyId, documentType: DocumentType.FACTURE, createdAt: { gte: from, lte: to } },
    });
  }

  countTransmittedFacturesInRange(companyId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        companyId,
        documentType: DocumentType.FACTURE,
        createdAt: { gte: from, lte: to },
        eInvoiceTransmissionStatus: { not: EInvoiceTransmissionStatus.NOT_SENT },
      },
    });
  }

  // Deliberately NOT scoped to the analytics window — same "legal-risk
  // count surfaces the whole book" reasoning as countUnsigned above, see
  // EInvoicingSnapshot.unsentFactureCount's own comment.
  countUnsentFactures(companyId: string): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        companyId,
        documentType: DocumentType.FACTURE,
        eInvoiceTransmissionStatus: EInvoiceTransmissionStatus.NOT_SENT,
      },
    });
  }
}
