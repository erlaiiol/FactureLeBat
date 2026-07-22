import { Injectable } from '@nestjs/common';
import { InvoiceEntryMode } from '../../generated/prisma/enums';
import { CompanyModel as Company } from '../../generated/prisma/models';
import { isVatApplicable } from '../company/legal-status.util';
import { UNIT_LABELS } from '../common/unit.util';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  InvoiceLineWithTotal,
  InvoiceServiceLineWithAmounts,
  InvoiceWithTotals,
  ManualInvoiceRowWithTotal,
  ManualInvoiceTableWithTotals,
} from './entities/invoice.entity';
import { InvoiceWithLines } from './invoice.repository';
import { computeManualRowTotalCents } from './manual/manual-table-calculation.util';
import {
  InvoicePdfData,
  InvoicePdfManualRow,
  InvoicePdfServiceLine,
} from './pdf/invoice-pdf-data.interface';
import { expandServiceLineWeights } from './redistribution.util';

// Sole responsibility: turn a persisted InvoiceWithLines (Prisma shape) into
// the API response shape and the PDF data object. Kept out of InvoiceService
// so that class stays focused on orchestration (repository + company +
// calculation calls) rather than response shaping.
@Injectable()
export class InvoiceMapper {
  constructor(private readonly calculationService: InvoiceCalculationService) {}

  // Totals are never persisted: they are recomputed from the invoice lines
  // (and, since Phase 5, the service lines) every time an invoice is read.
  // Each line's total is computed exactly once here and reused for both the
  // per-line figures and the subtotal.
  toInvoiceWithTotals(invoice: InvoiceWithLines): InvoiceWithTotals {
    if (invoice.entryMode === InvoiceEntryMode.MANUAL) {
      return this.toManualInvoiceWithTotals(invoice);
    }

    // Base product/material line totals, before any service redistribution.
    const lineTotalsById = new Map<string, number>();
    const billedQuantityById = new Map<string, string>();
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
      billedQuantityById.set(line.id, billedQuantity.toString());
    }

    let visibleServiceAmountCents = 0;
    const serviceLines: InvoiceServiceLineWithAmounts[] = invoice.serviceLines.map(
      (serviceLine) => {
        if (serviceLine.visibility === 'VISIBLE') {
          visibleServiceAmountCents += serviceLine.amountCents;
          return {
            id: serviceLine.id,
            position: serviceLine.position,
            name: serviceLine.name,
            description: serviceLine.description,
            amountCents: serviceLine.amountCents,
            visibility: serviceLine.visibility,
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
          name: serviceLine.name,
          description: serviceLine.description,
          amountCents: serviceLine.amountCents,
          visibility: serviceLine.visibility,
          distribution,
        };
      },
    );

    const lines: InvoiceLineWithTotal[] = invoice.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity.toString(),
      unitPriceCents: line.unitPriceCents,
      wasteSurcharge: line.wasteSurcharge,
      billedQuantity: billedQuantityById.get(line.id)!,
      packagingQuantity: line.packagingQuantity?.toString() ?? null,
      roundUpToPackaging: line.roundUpToPackaging,
      productCode: line.productCode,
      lineTotalExclVatCents: lineTotalsById.get(line.id)!,
    }));

    const subtotalExclVatCents =
      lines.reduce((sum, line) => sum + line.lineTotalExclVatCents, 0) + visibleServiceAmountCents;
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
      customerId: invoice.customerId,
      vatApplicable: invoice.vatApplicable,
      vatRateBasisPoints: invoice.vatRateBasisPoints,
      entryMode: InvoiceEntryMode.GUIDED,
      lines,
      serviceLines,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
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
        lineTotalExclVatCents: computeManualRowTotalCents(
          this.calculationService,
          columns,
          orderedValues,
        ),
      };
    });

    const subtotalExclVatCents = rows.reduce((sum, row) => sum + row.lineTotalExclVatCents, 0);
    const vatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      invoice.vatApplicable,
      invoice.vatRateBasisPoints,
    );

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
      customerId: invoice.customerId,
      vatApplicable: invoice.vatApplicable,
      vatRateBasisPoints: invoice.vatRateBasisPoints,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      manualTable,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
    };
  }

  toPdfData(invoice: InvoiceWithLines): InvoicePdfData {
    const withTotals = this.toInvoiceWithTotals(invoice);

    if (withTotals.entryMode === InvoiceEntryMode.MANUAL) {
      return this.toManualPdfData(invoice, withTotals);
    }

    return {
      number: withTotals.number,
      date: withTotals.date,
      issuerName: invoice.company.name,
      issuerAddressLine1: invoice.company.addressLine1,
      issuerAddressLine2: invoice.company.addressLine2,
      issuerPostalCode: invoice.company.postalCode,
      issuerCity: invoice.company.city,
      issuerSiret: invoice.company.siret,
      issuerEmail: invoice.company.email,
      issuerPhone: invoice.company.phone,
      customerName: withTotals.customerName,
      customerAddress: withTotals.customerAddress,
      customerEmail: withTotals.customerEmail,
      customerPhone: withTotals.customerPhone,
      entryMode: InvoiceEntryMode.GUIDED,
      lines: withTotals.lines.map((line) => ({
        description: line.description,
        // PdfService only ever renders plain text — the Unit enum -> label
        // conversion happens here, not in the PDF layer (see conventions.md's
        // "PDF generation must be isolated from business logic").
        unit: UNIT_LABELS[line.unit],
        quantity: line.quantity,
        // Only set when packaging rounding actually changed the priced
        // quantity — PdfService renders it as a clarifying note rather than
        // silently hiding the difference (see docs/roadmap.md Phase 8.5).
        billedQuantity: line.billedQuantity !== line.quantity ? line.billedQuantity : undefined,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.lineTotalExclVatCents,
      })),
      // Only VISIBLE service lines get their own line on the PDF —
      // REDISTRIBUTED ones are, by definition, already folded into the
      // product/material lines above and must never be shown separately.
      serviceLines: withTotals.serviceLines
        .filter((serviceLine) => serviceLine.visibility === 'VISIBLE')
        .map((serviceLine) => ({ name: serviceLine.name, amountCents: serviceLine.amountCents })),
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
    };
  }

  // Phase 9.5: renders a MANUAL invoice's own manualTable rather than the
  // lines/serviceLines tables — money formatting for each row's total still
  // happens in PdfService (see InvoicePdfManualRow), only the raw cell text
  // and the computed total cents are assembled here.
  private toManualPdfData(
    invoice: InvoiceWithLines,
    withTotals: InvoiceWithTotals,
  ): InvoicePdfData {
    const table = withTotals.manualTable!;
    const rows: InvoicePdfManualRow[] = table.rows.map((row) => ({
      cells: row.cells.map((cell) => cell.value),
      totalCents: row.lineTotalExclVatCents,
    }));

    return {
      number: withTotals.number,
      date: withTotals.date,
      issuerName: invoice.company.name,
      issuerAddressLine1: invoice.company.addressLine1,
      issuerAddressLine2: invoice.company.addressLine2,
      issuerPostalCode: invoice.company.postalCode,
      issuerCity: invoice.company.city,
      issuerSiret: invoice.company.siret,
      issuerEmail: invoice.company.email,
      issuerPhone: invoice.company.phone,
      customerName: withTotals.customerName,
      customerAddress: withTotals.customerAddress,
      customerEmail: withTotals.customerEmail,
      customerPhone: withTotals.customerPhone,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      manualTable: {
        columns: table.columns.map((column) => ({ label: column.label })),
        rows,
      },
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
    };
  }

  // Phase 6: same math as toInvoiceWithTotals/toPdfData, but run directly
  // off a not-yet-persisted CreateInvoiceDto — no ids exist yet, so lines
  // and their redistribution shares are tracked positionally (by array
  // index) instead of by persisted InvoiceLine id. This is safe because a
  // WEIGHTED service line's weights are already positional, aligned with
  // dto.lines (enforced by ServiceLineWeightsMatchLines at the DTO
  // boundary), and expandServiceLineWeights is the exact same function
  // InvoiceService.create() uses for the persisted path — the two can never
  // compute a different split for the same input. Never touches Prisma.
  toPreviewPdfData(dto: CreateInvoiceDto, company: Company): InvoicePdfData {
    if ((dto.entryMode ?? InvoiceEntryMode.GUIDED) === InvoiceEntryMode.MANUAL) {
      return this.toManualPreviewPdfData(dto, company);
    }

    const vatApplicable = isVatApplicable(company.legalStatus);
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

    let visibleServiceAmountCents = 0;
    const pdfServiceLines: InvoicePdfServiceLine[] = [];
    for (const serviceLine of dto.serviceLines ?? []) {
      if (serviceLine.visibility === 'VISIBLE') {
        visibleServiceAmountCents += serviceLine.amountCents;
        pdfServiceLines.push({ name: serviceLine.name, amountCents: serviceLine.amountCents });
        continue;
      }

      const weights = expandServiceLineWeights(serviceLine, dto.lines!.length)!;
      const shares = this.calculationService.computeWeightedSplit({
        amountCents: serviceLine.amountCents,
        weights,
      });
      shares.forEach((share, index) => {
        lineTotalsCents[index] += share;
      });
    }

    const pdfLines = dto.lines!.map((line, index) => {
      const quantity = line.quantity.toString();
      const billedQuantity = lineCalculations[index].billedQuantity.toString();
      return {
        description: line.description,
        unit: UNIT_LABELS[line.unit],
        quantity,
        billedQuantity: billedQuantity !== quantity ? billedQuantity : undefined,
        unitPriceCents: line.unitPriceCents,
        totalCents: lineTotalsCents[index],
      };
    });

    const subtotalExclVatCents =
      lineTotalsCents.reduce((sum, cents) => sum + cents, 0) + visibleServiceAmountCents;
    const vatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      vatApplicable,
      vatRateBasisPoints,
    );

    return {
      // Not a real invoice number — nothing is persisted, so no sequential
      // number was ever allocated. Distinct from any real "{prefix}-NNNNNN"
      // number, never collides.
      number: 'BROUILLON',
      date: new Date(),
      issuerName: company.name,
      issuerAddressLine1: company.addressLine1,
      issuerAddressLine2: company.addressLine2,
      issuerPostalCode: company.postalCode,
      issuerCity: company.city,
      issuerSiret: company.siret,
      issuerEmail: company.email,
      issuerPhone: company.phone,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress ?? null,
      customerEmail: dto.customerEmail ?? null,
      customerPhone: dto.customerPhone ?? null,
      entryMode: InvoiceEntryMode.GUIDED,
      lines: pdfLines,
      serviceLines: pdfServiceLines,
      vatApplicable,
      vatRateBasisPoints,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
    };
  }

  // Phase 9.5: same "recompute positionally off the not-yet-persisted DTO"
  // shape as the GUIDED preview above, but using computeManualRowTotalCents
  // (the exact same function toManualInvoiceWithTotals uses for the
  // persisted path) so a draft preview and the real created invoice can
  // never disagree on a manual row's total.
  private toManualPreviewPdfData(dto: CreateInvoiceDto, company: Company): InvoicePdfData {
    const vatApplicable = isVatApplicable(company.legalStatus);
    const vatRateBasisPoints = company.vatRateBasisPoints;
    const table = dto.manualTable!;

    const rows: InvoicePdfManualRow[] = table.rows.map((row) => ({
      cells: row.cells,
      totalCents: computeManualRowTotalCents(this.calculationService, table.columns, row.cells),
    }));
    const subtotalExclVatCents = rows.reduce((sum, row) => sum + row.totalCents, 0);
    const vatAmountCents = this.calculationService.computeVatAmountCents(
      subtotalExclVatCents,
      vatApplicable,
      vatRateBasisPoints,
    );

    return {
      number: 'BROUILLON',
      date: new Date(),
      issuerName: company.name,
      issuerAddressLine1: company.addressLine1,
      issuerAddressLine2: company.addressLine2,
      issuerPostalCode: company.postalCode,
      issuerCity: company.city,
      issuerSiret: company.siret,
      issuerEmail: company.email,
      issuerPhone: company.phone,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress ?? null,
      customerEmail: dto.customerEmail ?? null,
      customerPhone: dto.customerPhone ?? null,
      entryMode: InvoiceEntryMode.MANUAL,
      lines: [],
      serviceLines: [],
      manualTable: {
        columns: table.columns.map((column) => ({ label: column.label })),
        rows,
      },
      vatApplicable,
      vatRateBasisPoints,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
    };
  }
}
