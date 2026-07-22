import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const roboto = require('pdfmake/fonts/Roboto') as Record<string, unknown>;
import {
  InvoicePdfData,
  InvoicePdfLine,
  InvoicePdfServiceLine,
} from './invoice-pdf-data.interface';

const BUNDLED_FONTS_DIR = dirname(require.resolve('pdfmake/fonts/Roboto'));

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
// Intl's fr-FR formatting uses narrow no-break/no-break spaces as group and
// currency separators, which the bundled Roboto font has no glyph for
// (renders as a missing-glyph box) — normalize to plain spaces.
const centsToEuros = (cents: number): string =>
  eur.format(cents / 100).replace(/[\u202F\u00A0]/g, ' ');

pdfMake.addFonts(roboto as never);
// Invoice documents only ever contain static text/tables and the bundled
// Roboto font files — never trust or fetch any other external/local content
// while rendering them.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((path: string) => path.startsWith(BUNDLED_FONTS_DIR));

// Knows nothing about Prisma or business rules: only how to turn an
// InvoicePdfData object into a PDF document (Invoice Service > Invoice Data
// Object > PDF Generator > PDF File).
@Injectable()
export class PdfService {
  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const docDefinition = this.buildDocDefinition(data);
    return pdfMake.createPdf(docDefinition).getBuffer();
  }

  private buildDocDefinition(data: InvoicePdfData): TDocumentDefinitions {
    return {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      content: [
        this.buildHeader(data),
        { text: '\n' },
        this.buildParties(data),
        { text: '\n' },
        this.buildLinesTable(data),
        ...(data.serviceLines.length > 0
          ? [{ text: '\n' }, this.buildServiceLinesTable(data)]
          : []),
        { text: '\n' },
        this.buildTotals(data),
        { text: '\n\n' },
        this.buildFooter(data),
      ],
    };
  }

  private buildHeader(data: InvoicePdfData): Content {
    return {
      columns: [
        { text: `Facture ${data.number}`, style: 'title' },
        {
          text: `Date : ${data.date.toLocaleDateString('fr-FR')}`,
          alignment: 'right',
        },
      ],
    };
  }

  private buildParties(data: InvoicePdfData): Content {
    const issuerLines = [
      data.issuerName,
      data.issuerAddressLine1,
      data.issuerAddressLine2 ?? '',
      `${data.issuerPostalCode} ${data.issuerCity}`,
      `SIRET : ${data.issuerSiret}`,
      data.issuerEmail ?? '',
      data.issuerPhone ?? '',
    ].filter(Boolean);

    const customerLines = [
      data.customerName,
      data.customerAddress ?? '',
      data.customerEmail ?? '',
      data.customerPhone ?? '',
    ].filter(Boolean);

    return {
      columns: [
        { text: issuerLines.join('\n'), width: '50%' },
        {
          text: ['Facturé à\n', { text: customerLines.join('\n') }],
          width: '50%',
          alignment: 'right',
        },
      ],
    };
  }

  private buildLinesTable(data: InvoicePdfData): Content {
    const header = ['Description', 'Unité', 'Quantité', 'Prix unitaire', 'Total'];
    const rows = data.lines.map((line: InvoicePdfLine) => [
      line.description,
      line.unit,
      // Phase 8.5: billedQuantity is only ever set when packaging rounding
      // changed what's actually priced away from the raw site quantity —
      // shown as a clarifying note, never a silent substitution.
      line.billedQuantity ? `${line.quantity} (facturé : ${line.billedQuantity})` : line.quantity,
      centsToEuros(line.unitPriceCents),
      centsToEuros(line.totalCents),
    ]);

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [header, ...rows],
      },
    };
  }

  // Only VISIBLE service lines (Phase 5) ever reach here — REDISTRIBUTED
  // ones are already folded into buildLinesTable's totals by the time
  // InvoiceMapper builds this data object, so they never appear twice.
  private buildServiceLinesTable(data: InvoicePdfData): Content {
    const header = ['Prestations', 'Montant'];
    const rows = data.serviceLines.map((line: InvoicePdfServiceLine) => [
      line.name,
      centsToEuros(line.amountCents),
    ]);

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto'],
        body: [header, ...rows],
      },
    };
  }

  private buildTotals(data: InvoicePdfData): Content {
    const rows: [string, string][] = [['Sous-total HT', centsToEuros(data.subtotalExclVatCents)]];

    if (data.vatApplicable) {
      const vatRate = (data.vatRateBasisPoints / 100).toFixed(2);
      rows.push([`TVA (${vatRate} %)`, centsToEuros(data.vatAmountCents)]);
    }

    rows.push(['Total TTC', centsToEuros(data.totalInclVatCents)]);

    return {
      columns: [
        { text: '', width: '*' },
        {
          table: {
            widths: ['auto', 'auto'],
            body: rows,
          },
          layout: 'noBorders',
        },
      ],
    };
  }

  private buildFooter(data: InvoicePdfData): Content {
    const mentions = [
      data.vatApplicable ? undefined : 'TVA non applicable, art. 293 B du CGI.',
      "En cas de retard de paiement, une indemnité forfaitaire de 40€ pour frais de recouvrement est due, ainsi qu'une pénalité de retard calculée au taux d'intérêt légal en vigueur.",
    ].filter((mention): mention is string => Boolean(mention));

    return { text: mentions.join('\n'), fontSize: 7, color: '#555555' };
  }
}
