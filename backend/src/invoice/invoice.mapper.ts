import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  DocumentType,
  InvoiceEntryMode,
  InvoiceStatus,
  ManualColumnRole,
  NatureOperation,
  PlanTier,
  ServiceVisibility,
} from '../../generated/prisma/enums';
import { CompanyModel as Company } from '../../generated/prisma/models';
import { getEffectivePlanTier } from '../billing/plan-gate.service';
import { PLAN_DEFINITIONS } from '../billing/plan-config';
import { CompanyLogoData } from '../company/company.repository';
import { isVatApplicable } from '../company/legal-status.util';
import { UNIT_LABELS } from '../common/unit.util';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  InvoiceDiscountLineWithAmount,
  InvoiceLineWithTotal,
  InvoiceServiceLineWithAmounts,
  InvoiceWithTotals,
  ManualInvoiceRowWithTotal,
  ManualInvoiceTableWithTotals,
} from './entities/invoice.entity';
import { InvoiceWithLines } from './invoice.repository';
import { computeManualRowTotalCents } from './manual/manual-table-calculation.util';
import { InvoicePdfData, InvoicePdfManualRow } from './pdf/invoice-pdf-data.interface';
import { expandServiceLineWeights } from './redistribution.util';

// InvoiceRepository's INVOICE_INCLUDE already orders customerFields by
// position — this just strips the row down to the API/PDF shape.
function mapCustomerFields(invoice: InvoiceWithLines) {
  return invoice.customerFields.map((field) => ({
    id: field.id,
    label: field.label,
    value: field.value,
  }));
}

// Same shape as mapCustomerFields, but for the not-yet-persisted preview
// path — no id exists yet, so PdfService's rendering (label/value only)
// doesn't need one.
function mapDtoCustomerFields(dto: CreateInvoiceDto) {
  return (dto.customerFields ?? []).map((field) => ({ label: field.label, value: field.value }));
}

// Sole responsibility: turn a persisted InvoiceWithLines (Prisma shape) into
// the API response shape and the PDF data object. Kept out of InvoiceService
// so that class stays focused on orchestration (repository + company +
// calculation calls) rather than response shaping.
@Injectable()
export class InvoiceMapper {
  private static readonly logger = new Logger(InvoiceMapper.name);

  constructor(private readonly calculationService: InvoiceCalculationService) {}

  // Defensive safety net, GUIDED mode only (manual mode's totals are
  // deliberately freehand — see toManualInvoiceWithTotals, which never
  // calls this). Cross-checks the subtotal against an independently summed
  // total: every line's own priced amount plus every service line's amount,
  // regardless of visibility/redistribution. The two must always agree —
  // this is exactly the invariant a REDISTRIBUTED+hidden service line broke
  // once already (its share was folded into a line's total without the sum
  // staying in sync). Logged rather than thrown: a document must never be
  // blocked from being sent because of a bug in this check itself.
  private logIfTotalsDoNotReconcile(params: {
    context: string;
    rawLineTotalsCents: number[];
    allServiceLineAmountsCents: number[];
    discountLineAmountsCents: number[];
    subtotalExclVatCents: number;
  }): void {
    const expectedSubtotalExclVatCents = Math.max(
      0,
      params.rawLineTotalsCents.reduce((sum, cents) => sum + cents, 0) +
        params.allServiceLineAmountsCents.reduce((sum, cents) => sum + cents, 0) -
        params.discountLineAmountsCents.reduce((sum, cents) => sum + cents, 0),
    );
    if (expectedSubtotalExclVatCents !== params.subtotalExclVatCents) {
      InvoiceMapper.logger.warn(
        `Invoice totals do not reconcile for ${params.context}: sum of lines + services = ` +
          `${expectedSubtotalExclVatCents}, but computed subtotal = ${params.subtotalExclVatCents}`,
      );
    }
  }

  // Totals are never persisted: they are recomputed from the invoice lines
  // (and, since Phase 5, the service lines) every time an invoice is read.
  // Each line's total is computed exactly once here and reused for both the
  // per-line figures and the subtotal.
  toInvoiceWithTotals(invoice: InvoiceWithLines): InvoiceWithTotals {
    if (invoice.entryMode === InvoiceEntryMode.MANUAL) {
      return this.toManualInvoiceWithTotals(invoice);
    }

    // Base product/material line totals, before any service redistribution.
    // rawLineTotalsById is kept alongside the mutable lineTotalsById purely
    // to detect, per line, whether a REDISTRIBUTED service line touched it —
    // that's what decides whether displayUnitPriceCents below needs
    // recomputing (see InvoiceCalculationService.computeEffectiveUnitPriceCents).
    const lineTotalsById = new Map<string, number>();
    const rawLineTotalsById = new Map<string, number>();
    const billedQuantityById = new Map<string, string>();
    const billedQuantityDecimalById = new Map<string, Prisma.Decimal>();
    for (const line of invoice.lines) {
      const { lineTotalExclVatCents, billedQuantity } = this.calculationService.computeLineTotal({
        unit: line.unit,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity,
        roundUpToPackaging: line.roundUpToPackaging,
      });
      lineTotalsById.set(line.id, lineTotalExclVatCents);
      rawLineTotalsById.set(line.id, lineTotalExclVatCents);
      billedQuantityById.set(line.id, billedQuantity.toString());
      billedQuantityDecimalById.set(line.id, billedQuantity);
    }

    let visibleServiceAmountCents = 0;
    const serviceLines: InvoiceServiceLineWithAmounts[] = invoice.serviceLines.map(
      (serviceLine) => {
        if (serviceLine.visibility === 'VISIBLE') {
          visibleServiceAmountCents += serviceLine.amountCents;
          return {
            id: serviceLine.id,
            position: serviceLine.position,
            serviceId: serviceLine.serviceId,
            name: serviceLine.name,
            description: serviceLine.description,
            amountCents: serviceLine.amountCents,
            visibility: serviceLine.visibility,
            activityCategory: serviceLine.activityCategory,
          };
        }

        // REDISTRIBUTED: split the amount across the invoice's own lines,
        // in the order the weights were persisted for, and fold each share
        // directly into that line's displayed total — never persisted, only
        // ever recomputed here (see conventions.md's "derived data is never
        // persisted" rule). computeWeightedSplit guarantees the shares sum
        // to exactly serviceLine.amountCents, which is what makes the
        // invoice total increase by exactly the service amount regardless
        // of visibility mode.
        const shares = this.calculationService.computeWeightedSplit({
          amountCents: serviceLine.amountCents,
          weights: serviceLine.weights.map((w) => w.weight),
        });
        const distribution = serviceLine.weights.map((weightRow, index) => {
          lineTotalsById.set(
            weightRow.invoiceLineId,
            (lineTotalsById.get(weightRow.invoiceLineId) ?? 0) + shares[index],
          );
          return { invoiceLineId: weightRow.invoiceLineId, amountCents: shares[index] };
        });

        return {
          id: serviceLine.id,
          position: serviceLine.position,
          serviceId: serviceLine.serviceId,
          name: serviceLine.name,
          description: serviceLine.description,
          amountCents: serviceLine.amountCents,
          visibility: serviceLine.visibility,
          activityCategory: serviceLine.activityCategory,
          distribution,
        };
      },
    );

    const lines: InvoiceLineWithTotal[] = invoice.lines.map((line) => {
      const lineTotalExclVatCents = lineTotalsById.get(line.id)!;
      const displayUnitPriceCents =
        lineTotalExclVatCents === rawLineTotalsById.get(line.id)
          ? line.unitPriceCents
          : this.calculationService.computeEffectiveUnitPriceCents(
              lineTotalExclVatCents,
              billedQuantityDecimalById.get(line.id)!,
            );
      return {
        id: line.id,
        position: line.position,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        displayUnitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        billedQuantity: billedQuantityById.get(line.id)!,
        packagingQuantity: line.packagingQuantity?.toString() ?? null,
        roundUpToPackaging: line.roundUpToPackaging,
        productCode: line.productCode,
        productId: line.productId,
        showUnitDetail: line.showUnitDetail,
        showBillingDetail: line.showBillingDetail,
        activityCategory: line.activityCategory,
        lineTotalExclVatCents,
      };
    });

    // Phase 32: remises always fold straight into the subtotal, same
    // "always increases/decreases the total by its full amount" treatment
    // as a visible service line — floored at 0 so an over-discounted invoice
    // never shows a negative HT amount (see CreateInvoiceDiscountLineDto's
    // own bound, which only rejects an individual line's amount, not the sum).
    const discountLines: InvoiceDiscountLineWithAmount[] = invoice.discountLines.map(
      (discountLine) => ({
        id: discountLine.id,
        position: discountLine.position,
        discountId: discountLine.discountId,
        name: discountLine.name,
        amountCents: discountLine.amountCents,
        targetLineId: discountLine.targetInvoiceLineId,
        targetServiceLineId: discountLine.targetInvoiceServiceLineId,
      }),
    );
    const discountTotalCents = discountLines.reduce((sum, d) => sum + d.amountCents, 0);
    const subtotalExclVatCents = Math.max(
      0,
      lines.reduce((sum, line) => sum + line.lineTotalExclVatCents, 0) +
        visibleServiceAmountCents -
        discountTotalCents,
    );
    this.logIfTotalsDoNotReconcile({
      context: `invoice ${invoice.id}`,
      rawLineTotalsCents: [...rawLineTotalsById.values()],
      allServiceLineAmountsCents: invoice.serviceLines.map(
        (serviceLine) => serviceLine.amountCents,
      ),
      discountLineAmountsCents: discountLines.map((d) => d.amountCents),
      subtotalExclVatCents,
    });
    const vatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      invoice.vatApplicable,
      invoice.vatRateBasisPoints,
    );

    return {
      id: invoice.id,
      number: invoice.number,
      date: invoice.date,
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
      customerSiret: invoice.customerSiret,
      deliveryAddress: invoice.deliveryAddress,
      customerId: invoice.customerId,
      customerFields: mapCustomerFields(invoice),
      documentType: invoice.documentType,
      convertedFromDevisId: invoice.convertedFromDevisId,
      convertedToFacture: invoice.convertedToFacture,
      createdFromFactureId: invoice.createdFromFactureId,
      retroactiveDevis: invoice.retroactiveDevis,
      vatApplicable: invoice.vatApplicable,
      vatRateBasisPoints: invoice.vatRateBasisPoints,
      entryMode: InvoiceEntryMode.GUIDED,
      lines,
      serviceLines,
      discountLines,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
      sentAt: invoice.sentAt,
      sentToEmail: invoice.sentToEmail,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      lastReminderAt: invoice.lastReminderAt,
      simplifiedDisplay: invoice.simplifiedDisplay,
      hasSignatureProof: invoice.signature !== null,
      signatureMethod: invoice.signature?.method ?? null,
      manuallySigned: invoice.manuallySigned,
      depositPercentageBasisPoints: invoice.depositPercentageBasisPoints,
      depositAmountCents: invoice.depositAmountCents,
      depositPaidAt: invoice.depositPaidAt,
      reverseChargeApplicable: invoice.reverseChargeApplicable,
      manualNatureOfOperation: invoice.manualNatureOfOperation,
    };
  }

  // Phase 9.5: a MANUAL invoice's body lives in manualColumns/manualRows
  // instead of lines/serviceLines — each row is priced exactly like a
  // GUIDED UNIT-mode line (computeManualRowTotalCents), never persisted,
  // same "derived data is never persisted" rule as every other total here.
  private toManualInvoiceWithTotals(invoice: InvoiceWithLines): InvoiceWithTotals {
    const columns = invoice.manualColumns;
    const rows: ManualInvoiceRowWithTotal[] = invoice.manualRows.map((row) => {
      const cellByColumnId = new Map(row.cells.map((cell) => [cell.columnId, cell.value]));
      const orderedValues = columns.map((column) => cellByColumnId.get(column.id) ?? '');
      return {
        id: row.id,
        position: row.position,
        heightPx: row.heightPx,
        cells: columns.map((column, index) => ({
          columnId: column.id,
          value: orderedValues[index],
        })),
        lineTotalExclVatCents: computeManualRowTotalCents(columns, orderedValues),
      };
    });

    // Phase 9.5 bis: each of the three aggregate figures below is overridden
    // independently when the artisan set one — same "nothing computed
    // behind the artisan's back" principle as a row's LINE_TOTAL cell.
    // Overriding the subtotal still feeds a freshly computed VAT (so the
    // rate stays meaningful) unless the artisan also overrode VAT directly;
    // overriding the total skips the subtotal+VAT sum entirely.
    const computedSubtotalExclVatCents = rows.reduce(
      (sum, row) => sum + row.lineTotalExclVatCents,
      0,
    );
    const subtotalExclVatCents = invoice.subtotalOverrideCents ?? computedSubtotalExclVatCents;
    const computedVatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      invoice.vatApplicable,
      invoice.vatRateBasisPoints,
    );
    const vatAmountCents = invoice.vatOverrideCents ?? computedVatAmountCents;
    const totalInclVatCents = invoice.totalOverrideCents ?? subtotalExclVatCents + vatAmountCents;

    const manualTable: ManualInvoiceTableWithTotals = {
      columns: columns.map((column) => ({
        id: column.id,
        position: column.position,
        role: column.role,
        label: column.label,
        widthPx: column.widthPx,
      })),
      rows,
    };

    return {
      id: invoice.id,
      number: invoice.number,
      date: invoice.date,
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
      customerSiret: invoice.customerSiret,
      deliveryAddress: invoice.deliveryAddress,
      customerId: invoice.customerId,
      customerFields: mapCustomerFields(invoice),
      documentType: invoice.documentType,
      convertedFromDevisId: invoice.convertedFromDevisId,
      convertedToFacture: invoice.convertedToFacture,
      createdFromFactureId: invoice.createdFromFactureId,
      retroactiveDevis: invoice.retroactiveDevis,
      vatApplicable: invoice.vatApplicable,
      vatRateBasisPoints: invoice.vatRateBasisPoints,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      discountLines: [],
      manualTable,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents,
      sentAt: invoice.sentAt,
      sentToEmail: invoice.sentToEmail,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      lastReminderAt: invoice.lastReminderAt,
      simplifiedDisplay: invoice.simplifiedDisplay,
      hasSignatureProof: invoice.signature !== null,
      signatureMethod: invoice.signature?.method ?? null,
      manuallySigned: invoice.manuallySigned,
      depositPercentageBasisPoints: invoice.depositPercentageBasisPoints,
      depositAmountCents: invoice.depositAmountCents,
      depositPaidAt: invoice.depositPaidAt,
      reverseChargeApplicable: invoice.reverseChargeApplicable,
      manualNatureOfOperation: invoice.manualNatureOfOperation,
    };
  }

  toPdfData(
    invoice: InvoiceWithLines,
    logo?: CompanyLogoData | null,
    signature?: { image: Buffer; mimeType: string } | null,
  ): InvoicePdfData {
    const withTotals = this.toInvoiceWithTotals(invoice);

    if (withTotals.entryMode === InvoiceEntryMode.MANUAL) {
      return this.toManualPdfData(invoice, withTotals, logo, signature);
    }

    return {
      ...this.issuerFields(invoice.company, withTotals.documentType, logo),
      signature: this.signatureField(signature),
      number: withTotals.number,
      documentType: withTotals.documentType,
      date: withTotals.date,
      customerIsProfessional: invoice.customer?.isProfessional ?? false,
      customerName: withTotals.customerName,
      customerAddress: withTotals.customerAddress,
      customerEmail: withTotals.customerEmail,
      customerPhone: withTotals.customerPhone,
      customerSiret: withTotals.customerSiret,
      deliveryAddress: withTotals.deliveryAddress,
      customerFields: withTotals.customerFields,
      entryMode: InvoiceEntryMode.GUIDED,
      lines: withTotals.lines.map((line) => ({
        description: line.description,
        // PdfService only ever renders plain text — the Unit enum -> label
        // conversion happens here, not in the PDF layer (see conventions.md's
        // "PDF generation must be isolated from business logic"). Phase 15:
        // showUnitDetail is a pure rendering toggle set from the mandatory
        // preview screen — computeLineTotal never sees it, only PdfService's
        // output does.
        unit: line.showUnitDetail ? UNIT_LABELS[line.unit] : '',
        quantity: line.quantity,
        // Only set when packaging rounding actually changed the priced
        // quantity — PdfService renders it as a clarifying note rather than
        // silently hiding the difference (see docs/roadmap.md Phase 8.5) —
        // and only when Phase 15's showBillingDetail toggle is on.
        billedQuantity:
          line.showBillingDetail && line.billedQuantity !== line.quantity
            ? line.billedQuantity
            : undefined,
        unitPriceCents: line.displayUnitPriceCents,
        totalCents: line.lineTotalExclVatCents,
      })),
      // Only VISIBLE service lines get their own line on the PDF —
      // REDISTRIBUTED ones are, by definition, already folded into the
      // product/material lines above and must never be shown separately.
      serviceLines: withTotals.serviceLines
        .filter((serviceLine) => serviceLine.visibility === 'VISIBLE')
        .map((serviceLine) => ({ name: serviceLine.name, amountCents: serviceLine.amountCents })),
      discountLines: withTotals.discountLines.map((discountLine) => ({
        name: discountLine.name,
        amountCents: discountLine.amountCents,
      })),
      simplifiedDisplay: withTotals.simplifiedDisplay,
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      reverseChargeApplicable: withTotals.reverseChargeApplicable,
      natureOfOperation: this.deriveNatureOfOperation(withTotals.lines, withTotals.serviceLines),
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
      dueDate: withTotals.dueDate,
      depositPercentageBasisPoints: withTotals.depositPercentageBasisPoints,
      depositAmountCents: withTotals.depositAmountCents,
      depositPaidAt: withTotals.depositPaidAt,
    };
  }

  // Phase 9.5: renders a MANUAL invoice's own manualTable rather than the
  // lines/serviceLines tables — money formatting for each row's total still
  // happens in PdfService (see InvoicePdfManualRow), only the raw cell text
  // and the computed total cents are assembled here.
  private toManualPdfData(
    invoice: InvoiceWithLines,
    withTotals: InvoiceWithTotals,
    logo?: CompanyLogoData | null,
    signature?: { image: Buffer; mimeType: string } | null,
  ): InvoicePdfData {
    const table = withTotals.manualTable!;
    // LINE_TOTAL is excluded from the PDF's per-column cells — it's already
    // rendered as the trailing computed "Total" column below, formatted
    // consistently regardless of exactly how the artisan typed it (e.g.
    // "150" vs "150,00"); showing it twice would just be visual noise.
    const lineTotalIndex = table.columns.findIndex(
      (column) => column.role === ManualColumnRole.LINE_TOTAL,
    );
    const rows: InvoicePdfManualRow[] = table.rows.map((row) => ({
      cells: row.cells.filter((_, index) => index !== lineTotalIndex).map((cell) => cell.value),
      totalCents: row.lineTotalExclVatCents,
    }));

    return {
      ...this.issuerFields(invoice.company, withTotals.documentType, logo),
      signature: this.signatureField(signature),
      number: withTotals.number,
      documentType: withTotals.documentType,
      date: withTotals.date,
      customerIsProfessional: invoice.customer?.isProfessional ?? false,
      customerName: withTotals.customerName,
      customerAddress: withTotals.customerAddress,
      customerEmail: withTotals.customerEmail,
      customerPhone: withTotals.customerPhone,
      customerSiret: withTotals.customerSiret,
      deliveryAddress: withTotals.deliveryAddress,
      customerFields: withTotals.customerFields,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      discountLines: [],
      manualTable: {
        columns: table.columns
          .filter((_, index) => index !== lineTotalIndex)
          .map((column) => ({ label: column.label })),
        rows,
      },
      // Manual mode's freehand column set has no fixed Quantité/Prix
      // unitaire columns to hide — see InvoicePdfData.simplifiedDisplay.
      simplifiedDisplay: false,
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      reverseChargeApplicable: withTotals.reverseChargeApplicable,
      natureOfOperation: withTotals.manualNatureOfOperation ?? NatureOperation.PRESTATION_SERVICES,
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
      dueDate: withTotals.dueDate,
      depositPercentageBasisPoints: withTotals.depositPercentageBasisPoints,
      depositAmountCents: withTotals.depositAmountCents,
      depositPaidAt: withTotals.depositPaidAt,
    };
  }

  // Phase 6: same math as toInvoiceWithTotals, but run directly off a
  // not-yet-persisted CreateInvoiceDto — no ids exist yet, so lines and
  // their redistribution shares are tracked positionally (by array index,
  // reused as the synthetic id below) instead of by persisted InvoiceLine
  // id. This is safe because a WEIGHTED service line's weights are already
  // positional, aligned with dto.lines (enforced by
  // ServiceLineWeightsMatchLines at the DTO boundary), and
  // expandServiceLineWeights is the exact same function InvoiceService.
  // create() uses for the persisted path — the two can never compute a
  // different split for the same input. Never touches Prisma.
  //
  // Phase 15: this is also what the mandatory preview screen's HTML mirror
  // reads (via InvoiceController's preview-data route) — returning the same
  // InvoiceWithTotals shape as the persisted path, rather than a PDF-only
  // object, means the frontend never needs to duplicate this calculation to
  // render its own per-line figures (see docs/conventions.md's "no
  // business-logic duplication").
  toPreviewInvoiceWithTotals(dto: CreateInvoiceDto, company: Company): InvoiceWithTotals {
    if ((dto.entryMode ?? InvoiceEntryMode.GUIDED) === InvoiceEntryMode.MANUAL) {
      return this.toManualPreviewInvoiceWithTotals(dto, company);
    }

    // Phase 1.1-7: same "reverseChargeApplicable always wins" precedence as
    // InvoiceService.create — GUIDED has no vatApplicableOverride to
    // consider (ManualModeFieldsConsistency forbids it here), so this is
    // simpler than the MANUAL preview's equivalent line below.
    const vatApplicable = dto.reverseChargeApplicable
      ? false
      : isVatApplicable(company.legalStatus);
    const vatRateBasisPoints = company.vatRateBasisPoints;

    const lineCalculations = dto.lines!.map((line) =>
      this.calculationService.computeLineTotal({
        unit: line.unit,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity,
        roundUpToPackaging: line.roundUpToPackaging ?? true,
      }),
    );
    const lineTotalsCents = lineCalculations.map((c) => c.lineTotalExclVatCents);
    // Snapshot before the redistribution loop below mutates lineTotalsCents
    // in place — same "detect whether a REDISTRIBUTED service line touched
    // this line" purpose as rawLineTotalsById in toInvoiceWithTotals.
    const rawLineTotalsCents = [...lineTotalsCents];

    let visibleServiceAmountCents = 0;
    const serviceLines: InvoiceServiceLineWithAmounts[] = [];
    for (const serviceLine of dto.serviceLines ?? []) {
      if (serviceLine.visibility === 'VISIBLE') {
        visibleServiceAmountCents += serviceLine.amountCents;
        serviceLines.push({
          id: String(serviceLines.length),
          position: serviceLines.length,
          serviceId: serviceLine.serviceId ?? null,
          name: serviceLine.name,
          description: serviceLine.description ?? null,
          amountCents: serviceLine.amountCents,
          visibility: serviceLine.visibility,
          activityCategory: serviceLine.activityCategory ?? null,
        });
        continue;
      }

      const weights = expandServiceLineWeights(serviceLine, dto.lines!.length)!;
      const shares = this.calculationService.computeWeightedSplit({
        amountCents: serviceLine.amountCents,
        weights,
      });
      const distribution = shares.map((amountCents, index) => {
        lineTotalsCents[index] += amountCents;
        return { invoiceLineId: String(index), amountCents };
      });
      serviceLines.push({
        id: String(serviceLines.length),
        position: serviceLines.length,
        serviceId: serviceLine.serviceId ?? null,
        name: serviceLine.name,
        description: serviceLine.description ?? null,
        amountCents: serviceLine.amountCents,
        visibility: serviceLine.visibility,
        activityCategory: serviceLine.activityCategory ?? null,
        distribution,
      });
    }

    const lines: InvoiceLineWithTotal[] = dto.lines!.map((line, index) => {
      const quantity = line.quantity.toString();
      const lineTotalExclVatCents = lineTotalsCents[index];
      const displayUnitPriceCents =
        lineTotalExclVatCents === rawLineTotalsCents[index]
          ? line.unitPriceCents
          : this.calculationService.computeEffectiveUnitPriceCents(
              lineTotalExclVatCents,
              lineCalculations[index].billedQuantity,
            );
      return {
        id: String(index),
        position: index,
        description: line.description,
        unit: line.unit,
        quantity,
        unitPriceCents: line.unitPriceCents,
        displayUnitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        billedQuantity: lineCalculations[index].billedQuantity.toString(),
        packagingQuantity: line.packagingQuantity?.toString() ?? null,
        roundUpToPackaging: line.roundUpToPackaging ?? true,
        productCode: line.productCode ?? null,
        productId: line.productId ?? null,
        showUnitDetail: line.showUnitDetail ?? true,
        showBillingDetail: line.showBillingDetail ?? true,
        activityCategory: line.activityCategory ?? null,
        lineTotalExclVatCents,
      };
    });

    // Phase 32: same positional-synthetic-id treatment as lines/serviceLines
    // above — no ids exist yet for a not-yet-persisted draft.
    const discountLines: InvoiceDiscountLineWithAmount[] = (dto.discountLines ?? []).map(
      (discountLine, index) => ({
        id: String(index),
        position: index,
        discountId: discountLine.discountId ?? null,
        name: discountLine.name,
        amountCents: discountLine.amountCents,
        // Phase 34: same positional-synthetic-id treatment as lines/
        // serviceLines above — targetLineIndex/targetServiceLineIndex are
        // already the exact index a line/serviceLine's own synthetic id was
        // built from (String(index)), so no lookup is needed here.
        targetLineId:
          discountLine.targetLineIndex !== undefined ? String(discountLine.targetLineIndex) : null,
        targetServiceLineId:
          discountLine.targetServiceLineIndex !== undefined
            ? String(discountLine.targetServiceLineIndex)
            : null,
      }),
    );
    const discountTotalCents = discountLines.reduce((sum, d) => sum + d.amountCents, 0);

    const subtotalExclVatCents = Math.max(
      0,
      lineTotalsCents.reduce((sum, cents) => sum + cents, 0) +
        visibleServiceAmountCents -
        discountTotalCents,
    );
    this.logIfTotalsDoNotReconcile({
      context: 'invoice preview',
      rawLineTotalsCents,
      allServiceLineAmountsCents: (dto.serviceLines ?? []).map(
        (serviceLine) => serviceLine.amountCents,
      ),
      discountLineAmountsCents: discountLines.map((d) => d.amountCents),
      subtotalExclVatCents,
    });
    const vatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      vatApplicable,
      vatRateBasisPoints,
    );

    return {
      // Not a real invoice: nothing is persisted, so no number was ever
      // allocated. Falls back to 'BROUILLON' only until the artisan's own
      // suggested/typed number (dto.number, see InvoiceService.getNextNumber)
      // is known — once it is, the preview shows exactly what will be used.
      id: '',
      number: dto.number ?? 'BROUILLON',
      date: new Date(),
      customerName: dto.customerName,
      customerAddress: dto.customerAddress ?? null,
      customerEmail: dto.customerEmail ?? null,
      customerPhone: dto.customerPhone ?? null,
      customerSiret: dto.customerSiret ?? null,
      deliveryAddress: dto.deliveryAddress ?? null,
      customerId: dto.customerId ?? null,
      customerFields: mapDtoCustomerFields(dto).map((field) => ({ id: '', ...field })),
      documentType: dto.documentType ?? DocumentType.FACTURE,
      convertedFromDevisId: null,
      convertedToFacture: null,
      createdFromFactureId: null,
      retroactiveDevis: null,
      vatApplicable,
      vatRateBasisPoints,
      entryMode: InvoiceEntryMode.GUIDED,
      lines,
      serviceLines,
      discountLines,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
      sentAt: null,
      sentToEmail: null,
      // Phase 16: an unsaved draft has no lifecycle yet — the board only
      // ever sees a persisted invoice, so these are always this fixed
      // default here, never read from anywhere else.
      status: InvoiceStatus.NON_PAYEE,
      dueDate: null,
      paidAt: null,
      lastReminderAt: null,
      simplifiedDisplay: dto.simplifiedDisplay ?? false,
      // Phase 1.1-1: an unsaved draft has no id yet, so it can never have a
      // signature attached — always this fixed default, same reasoning as
      // status/dueDate/paidAt above.
      hasSignatureProof: false,
      signatureMethod: null,
      manuallySigned: false,
      // Phase 1.1-3: mirrors the artisan's not-yet-submitted deposit toggle
      // straight from the DTO — the preview/aperçu screen is what renders
      // this, same "no business-logic duplication" reasoning as every other
      // figure here. Never depositPaidAt: an unsaved draft has no lifecycle
      // yet, same reasoning as status/dueDate/paidAt above.
      depositPercentageBasisPoints: dto.depositPercentageBasisPoints ?? null,
      depositAmountCents: dto.depositAmountCents ?? null,
      depositPaidAt: null,
      // Phase 1.1-7: mirrors the not-yet-submitted DTO, same reasoning as
      // the deposit fields above.
      reverseChargeApplicable: dto.reverseChargeApplicable ?? false,
      // Phase 1.1-8: GUIDED never persists this — see NatureOperation's own
      // comment. ManualModeFieldsConsistency guarantees
      // dto.manualNatureOfOperation is undefined here anyway.
      manualNatureOfOperation: null,
    };
  }

  // Phase 9.5: same "recompute positionally off the not-yet-persisted DTO"
  // shape as the GUIDED preview above, but using computeManualRowTotalCents
  // (the exact same function toManualInvoiceWithTotals uses for the
  // persisted path) so a draft preview and the real created invoice can
  // never disagree on a manual row's total.
  private toManualPreviewInvoiceWithTotals(
    dto: CreateInvoiceDto,
    company: Company,
  ): InvoiceWithTotals {
    // Same override precedence as InvoiceService.create — run directly off
    // the not-yet-persisted DTO so a draft preview/PDF aperçu can never
    // disagree with the real created invoice on which VAT treatment applies.
    // Phase 1.1-7: reverseChargeApplicable wins over vatApplicableOverride,
    // same precedence as InvoiceService.create.
    const vatApplicable = dto.reverseChargeApplicable
      ? false
      : (dto.vatApplicableOverride ?? isVatApplicable(company.legalStatus));
    const vatRateBasisPoints = dto.vatRateBasisPointsOverride ?? company.vatRateBasisPoints;
    const table = dto.manualTable!;

    const rows: ManualInvoiceRowWithTotal[] = table.rows.map((row, index) => ({
      id: String(index),
      position: index,
      heightPx: row.heightPx ?? null,
      cells: row.cells.map((value, cellIndex) => ({
        columnId: String(cellIndex),
        value,
      })),
      lineTotalExclVatCents: computeManualRowTotalCents(table.columns, row.cells),
    }));
    // Phase 9.5 bis: same override precedence as toManualInvoiceWithTotals,
    // run directly off the not-yet-persisted DTO so a draft preview can
    // never disagree with the real created invoice.
    const computedSubtotalExclVatCents = rows.reduce(
      (sum, row) => sum + row.lineTotalExclVatCents,
      0,
    );
    const subtotalExclVatCents = dto.subtotalOverrideCents ?? computedSubtotalExclVatCents;
    const computedVatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      vatApplicable,
      vatRateBasisPoints,
    );
    const vatAmountCents = dto.vatOverrideCents ?? computedVatAmountCents;
    const totalInclVatCents = dto.totalOverrideCents ?? subtotalExclVatCents + vatAmountCents;

    return {
      id: '',
      // Same fallback rule as toPreviewInvoiceWithTotals above.
      number: dto.number ?? 'BROUILLON',
      date: new Date(),
      customerName: dto.customerName,
      customerAddress: dto.customerAddress ?? null,
      customerEmail: dto.customerEmail ?? null,
      customerPhone: dto.customerPhone ?? null,
      customerSiret: dto.customerSiret ?? null,
      deliveryAddress: dto.deliveryAddress ?? null,
      customerId: dto.customerId ?? null,
      customerFields: mapDtoCustomerFields(dto).map((field) => ({ id: '', ...field })),
      documentType: dto.documentType ?? DocumentType.FACTURE,
      convertedFromDevisId: null,
      convertedToFacture: null,
      createdFromFactureId: null,
      retroactiveDevis: null,
      vatApplicable,
      vatRateBasisPoints,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      discountLines: [],
      manualTable: {
        columns: table.columns.map((column, index) => ({
          id: String(index),
          position: index,
          role: column.role,
          label: column.label,
          widthPx: column.widthPx ?? null,
        })),
        rows,
      },
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents,
      sentAt: null,
      sentToEmail: null,
      // Phase 16: an unsaved draft has no lifecycle yet — the board only
      // ever sees a persisted invoice, so these are always this fixed
      // default here, never read from anywhere else.
      status: InvoiceStatus.NON_PAYEE,
      dueDate: null,
      paidAt: null,
      lastReminderAt: null,
      // Manual mode's freehand column set has no fixed Quantité/Prix
      // unitaire columns to hide — see InvoicePdfData.simplifiedDisplay.
      simplifiedDisplay: false,
      // Phase 1.1-1: same "unsaved draft has no signature" reasoning as the
      // GUIDED preview branch above.
      hasSignatureProof: false,
      signatureMethod: null,
      manuallySigned: false,
      // Phase 1.1-3: same "mirror the not-yet-submitted DTO" reasoning as
      // toPreviewInvoiceWithTotals above.
      depositPercentageBasisPoints: dto.depositPercentageBasisPoints ?? null,
      depositAmountCents: dto.depositAmountCents ?? null,
      depositPaidAt: null,
      // Phase 1.1-7: mirrors the not-yet-submitted DTO, same reasoning as
      // the deposit fields above.
      reverseChargeApplicable: dto.reverseChargeApplicable ?? false,
      // Phase 1.1-8: mirrors InvoiceService.create's own default-fill, so
      // this JSON preview can never disagree with what actually persists.
      manualNatureOfOperation: dto.manualNatureOfOperation ?? NatureOperation.PRESTATION_SERVICES,
    };
  }

  // Phase 6/15: PDF rendering of the not-yet-persisted preview — built on
  // top of toPreviewInvoiceWithTotals's already-computed figures, the exact
  // same "compute once, reshape for PDF" pattern toPdfData applies to
  // toInvoiceWithTotals, so the JSON preview (Phase 15's HTML mirror) and
  // this PDF can never disagree on a number.
  toPreviewPdfData(
    dto: CreateInvoiceDto,
    company: Company,
    logo?: CompanyLogoData | null,
    // Phase 1.1-7: resolved by the caller (InvoiceService.previewPdf) from
    // dto.customerId, since this method — unlike toPdfData — has no
    // InvoiceWithLines to read a live-joined customer off. Defaults false so
    // every pre-1.1-7 caller (there are none besides previewPdf, but kept
    // for signature safety) still compiles/behaves unchanged.
    customerIsProfessional = false,
  ): InvoicePdfData {
    const withTotals = this.toPreviewInvoiceWithTotals(dto, company);
    const issuer = this.issuerFields(company, withTotals.documentType, logo);

    if (withTotals.entryMode === InvoiceEntryMode.MANUAL) {
      const table = withTotals.manualTable!;
      return {
        ...issuer,
        // Phase 1.1-1: a preview has no id yet, so it can never have a
        // signature attached — see InvoiceService.previewPdf.
        signature: null,
        number: withTotals.number,
        documentType: withTotals.documentType,
        date: withTotals.date,
        customerIsProfessional,
        customerName: withTotals.customerName,
        customerAddress: withTotals.customerAddress,
        customerEmail: withTotals.customerEmail,
        customerPhone: withTotals.customerPhone,
        customerSiret: withTotals.customerSiret,
        deliveryAddress: withTotals.deliveryAddress,
        customerFields: withTotals.customerFields,
        entryMode: InvoiceEntryMode.MANUAL,
        lines: [],
        serviceLines: [],
        discountLines: [],
        manualTable: {
          columns: table.columns.map((column) => ({ label: column.label })),
          rows: table.rows.map((row) => ({
            cells: row.cells.map((cell) => cell.value),
            totalCents: row.lineTotalExclVatCents,
          })),
        },
        simplifiedDisplay: false,
        vatApplicable: withTotals.vatApplicable,
        vatRateBasisPoints: withTotals.vatRateBasisPoints,
        reverseChargeApplicable: withTotals.reverseChargeApplicable,
        natureOfOperation:
          withTotals.manualNatureOfOperation ?? NatureOperation.PRESTATION_SERVICES,
        subtotalExclVatCents: withTotals.subtotalExclVatCents,
        vatAmountCents: withTotals.vatAmountCents,
        totalInclVatCents: withTotals.totalInclVatCents,
        // A preview has no lifecycle yet, same reasoning as the deposit
        // fields below.
        dueDate: null,
        depositPercentageBasisPoints: withTotals.depositPercentageBasisPoints,
        depositAmountCents: withTotals.depositAmountCents,
        depositPaidAt: null,
      };
    }

    return {
      ...issuer,
      signature: null,
      number: withTotals.number,
      documentType: withTotals.documentType,
      date: withTotals.date,
      customerIsProfessional,
      customerName: withTotals.customerName,
      customerAddress: withTotals.customerAddress,
      customerEmail: withTotals.customerEmail,
      customerPhone: withTotals.customerPhone,
      customerSiret: withTotals.customerSiret,
      deliveryAddress: withTotals.deliveryAddress,
      customerFields: withTotals.customerFields,
      entryMode: InvoiceEntryMode.GUIDED,
      lines: withTotals.lines.map((line) => ({
        description: line.description,
        unit: line.showUnitDetail ? UNIT_LABELS[line.unit] : '',
        quantity: line.quantity,
        billedQuantity:
          line.showBillingDetail && line.billedQuantity !== line.quantity
            ? line.billedQuantity
            : undefined,
        unitPriceCents: line.displayUnitPriceCents,
        totalCents: line.lineTotalExclVatCents,
      })),
      serviceLines: withTotals.serviceLines
        .filter((serviceLine) => serviceLine.visibility === 'VISIBLE')
        .map((serviceLine) => ({ name: serviceLine.name, amountCents: serviceLine.amountCents })),
      discountLines: withTotals.discountLines.map((discountLine) => ({
        name: discountLine.name,
        amountCents: discountLine.amountCents,
      })),
      simplifiedDisplay: withTotals.simplifiedDisplay,
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      reverseChargeApplicable: withTotals.reverseChargeApplicable,
      natureOfOperation: this.deriveNatureOfOperation(withTotals.lines, withTotals.serviceLines),
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
      dueDate: null,
      depositPercentageBasisPoints: withTotals.depositPercentageBasisPoints,
      depositAmountCents: withTotals.depositAmountCents,
      depositPaidAt: null,
    };
  }

  // Phase 1.1-8: GUIDED's "nature de l'opération" — purely mechanical, zero
  // artisan input, matching docs/roadmap.md Phase 1.1-8's own wording: a
  // GUIDED invoice with lines but no VISIBLE service line reads as
  // LIVRAISON_BIENS even when every line typed in is conceptually labor
  // (e.g. "Pose parquet"), since `lines` vs `serviceLines` is a structural
  // split, not a semantic one — this is the literal rule asked for, not an
  // attempt at smarter classification.
  private deriveNatureOfOperation(
    lines: unknown[],
    serviceLines: { visibility: ServiceVisibility }[],
  ): NatureOperation {
    const hasGoods = lines.length > 0;
    const hasVisibleServices = serviceLines.some((line) => line.visibility === 'VISIBLE');
    if (hasGoods && hasVisibleServices) {
      return NatureOperation.BIENS_ET_SERVICES;
    }
    if (hasGoods) {
      return NatureOperation.LIVRAISON_BIENS;
    }
    return NatureOperation.PRESTATION_SERVICES;
  }

  // Shared by every PDF-shaping method (persisted and preview alike) — the
  // seven issuer-prefixed fields never vary with entryMode or with whether
  // the invoice is persisted yet.
  // logo is fetched separately by the caller (InvoiceService/InvoiceMailService,
  // via CompanyService.getLogo) rather than joined onto `company` — see
  // schema.prisma's comment on Company.logo for why it's kept out of the
  // ordinary Company read. undefined for a not-yet-persisted preview when
  // the caller hasn't fetched it; treated the same as "no logo".
  // documentType (Phase 1.1-6) only feeds customFooterMessage's resolution
  // below — every other field here is still documentType-independent.
  private issuerFields(
    company: Company,
    documentType: DocumentType,
    logo?: CompanyLogoData | null,
  ) {
    return {
      issuerName: company.name,
      issuerAddressLine1: company.addressLine1,
      issuerAddressLine2: company.addressLine2,
      issuerPostalCode: company.postalCode,
      issuerCity: company.city,
      issuerSiret: company.siret,
      issuerEmail: company.email,
      issuerPhone: company.phone,
      // Whether the *company itself* benefits from the franchise en base de
      // TVA (art. 293 B du CGI) — independent of what a given manual
      // invoice's vatApplicable ends up being (see
      // CreateInvoiceDto.vatApplicableOverride). PdfService only cites that
      // article when this is true; a VAT-registered company that overrides
      // one invoice to "TVA non applicable" gets the plain mention instead,
      // since art. 293 B would be a false legal citation for them.
      companyVatExempt: !isVatApplicable(company.legalStatus),
      issuerLogo: logo
        ? {
            base64: `data:${logo.mimeType};base64,${logo.image.toString('base64')}`,
            mimeType: logo.mimeType,
          }
        : null,
      // A company that never subscribed/was never granted a tier is treated
      // as Essentiel here too — same fallback PlanGateService.assertCatalogCapacity
      // uses — so the watermark is never accidentally suppressed for a
      // company that simply hasn't paid for anything yet.
      showWatermark:
        !PLAN_DEFINITIONS[getEffectivePlanTier(company) ?? PlanTier.ESSENTIEL].removesWatermark,
      // BTP mandatory mention (art. L243-2 du Code des assurances) — null
      // unless the artisan both declared themself subject to garantie
      // décennale AND filled in all three detail fields (UpdateCompanyDto
      // requires all three together, but an existing row saved before this
      // field existed could still have the flag set with blanks). PdfService
      // only prints the mention when this is non-null.
      decennialInsurance:
        company.decennialInsuranceApplicable &&
        company.decennialInsurerName &&
        company.decennialInsurancePolicyNumber &&
        company.decennialInsuranceCoverageArea
          ? {
              insurerName: company.decennialInsurerName,
              policyNumber: company.decennialInsurancePolicyNumber,
              coverageArea: company.decennialInsuranceCoverageArea,
            }
          : null,
      // Phase 1.1-6: resolved here (not in PdfService) since "which toggle
      // applies" is a business rule, same reasoning as companyVatExempt
      // above — null whenever the toggle for this document's type is off or
      // the message is blank, in which case PdfService prints nothing extra.
      customFooterMessage:
        (documentType === DocumentType.FACTURE
          ? company.customFooterOnFacture
          : company.customFooterOnDevis) && company.customFooterMessage
          ? company.customFooterMessage
          : null,
      // Phase 1.1-7: raw passthrough — whether it actually prints depends on
      // customerIsProfessional too (a per-invoice fact this method doesn't
      // have), so that gating lives in PdfService.buildFooter instead of
      // here, unlike customFooterMessage above.
      earlyPaymentDiscountMention: company.earlyPaymentDiscountMention,
      // Phase 1.1-8: raw passthrough — FACTURE-only gating lives in
      // PdfService.buildFooter, same split as earlyPaymentDiscountMention
      // above.
      vatOnDebitsOption: company.vatOnDebitsOption,
    };
  }

  // Phase 1.1-1: same base64-data-URI shape as issuerLogo above, just kept
  // separate since a signature is invoice-specific, not company-specific
  // (issuerFields is shared by every PDF-shaping method regardless of
  // which invoice, or none yet for a preview).
  private signatureField(
    signature?: { image: Buffer; mimeType: string } | null,
  ): { base64: string; mimeType: string } | null {
    return signature
      ? {
          base64: `data:${signature.mimeType};base64,${signature.image.toString('base64')}`,
          mimeType: signature.mimeType,
        }
      : null;
  }
}
