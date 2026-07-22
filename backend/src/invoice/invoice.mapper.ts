import { Injectable } from '@nestjs/common';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { InvoiceLineWithTotal, InvoiceWithTotals } from './entities/invoice.entity';
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
  // every time an invoice is read. Each line's total is computed exactly
  // once here and reused for both the per-line figures and the subtotal.
  toInvoiceWithTotals(invoice: InvoiceWithLines): InvoiceWithTotals {
    const lines: InvoiceLineWithTotal[] = invoice.lines.map((line) => {
      const { lineTotalExclVatCents } = this.calculationService.computeLineTotal({
        mode: line.mode,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
      });

      return {
        id: line.id,
        position: line.position,
        description: line.description,
        unit: line.unit,
        mode: line.mode,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        lineTotalExclVatCents,
      };
    });

    const subtotalExclVatCents = lines.reduce((sum, line) => sum + line.lineTotalExclVatCents, 0);
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
      vatApplicable: withTotals.vatApplicable,
      vatRateBasisPoints: withTotals.vatRateBasisPoints,
      subtotalExclVatCents: withTotals.subtotalExclVatCents,
      vatAmountCents: withTotals.vatAmountCents,
      totalInclVatCents: withTotals.totalInclVatCents,
    };
  }
}
