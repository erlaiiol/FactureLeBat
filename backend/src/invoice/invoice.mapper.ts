import { Injectable } from '@nestjs/common';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import {
  InvoiceLineWithTotal,
  InvoiceServiceLineWithAmounts,
  InvoiceWithTotals,
} from './entities/invoice.entity';
import { InvoiceWithLines } from './invoice.repository';
import { InvoicePdfData } from './pdf/invoice-pdf-data.interface';

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
    // Base product/material line totals, before any service redistribution.
    const lineTotalsById = new Map<string, number>();
    for (const line of invoice.lines) {
      const { lineTotalExclVatCents } = this.calculationService.computeLineTotal({
        mode: line.mode,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
      });
      lineTotalsById.set(line.id, lineTotalExclVatCents);
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
      mode: line.mode,
      quantity: line.quantity.toString(),
      unitPriceCents: line.unitPriceCents,
      wasteSurcharge: line.wasteSurcharge,
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
      lines,
      serviceLines,
      subtotalExclVatCents,
      vatAmountCents,
      totalInclVatCents: subtotalExclVatCents + vatAmountCents,
    };
  }

  toPdfData(invoice: InvoiceWithLines): InvoicePdfData {
    const withTotals = this.toInvoiceWithTotals(invoice);

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
      lines: withTotals.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
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
}
