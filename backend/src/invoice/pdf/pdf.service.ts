import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const roboto = require('pdfmake/fonts/Roboto') as Record<string, unknown>;
import {
  InvoicePdfData,
  InvoicePdfLine,
  InvoicePdfManualRow,
  InvoicePdfServiceLine,
} from './invoice-pdf-data.interface';

const BUNDLED_FONTS_DIR = dirname(require.resolve('pdfmake/fonts/Roboto'));

// "Atelier sobre" (docs/design-system.md) applied to the one sanctioned spot
// on the PDF: the header sent to the artisan's own client. Self-hosted
// (OFL-licensed) .ttf files, same "bundled, never fetched" pattern as
// Roboto above — never a network font load during PDF generation.
const ZILLA_SLAB_TTF =
  require.resolve('@expo-google-fonts/zilla-slab/600SemiBold/ZillaSlab_600SemiBold.ttf');
const WORK_SANS_REGULAR_TTF =
  require.resolve('@expo-google-fonts/work-sans/400Regular/WorkSans_400Regular.ttf');
const WORK_SANS_BOLD_TTF =
  require.resolve('@expo-google-fonts/work-sans/700Bold/WorkSans_700Bold.ttf');
const ATELIER_FONTS_DIRS = [dirname(ZILLA_SLAB_TTF), dirname(WORK_SANS_REGULAR_TTF)];

const ATELIER_WALNUT = '#6B4A34';
const ATELIER_INK_SOFT = '#746A5D';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
// Intl's fr-FR formatting uses narrow no-break/no-break spaces as group and
// currency separators, which the bundled Roboto font has no glyph for
// (renders as a missing-glyph box) — normalize to plain spaces.
const centsToEuros = (cents: number): string =>
  eur.format(cents / 100).replace(/[\u202F\u00A0]/g, ' ');

pdfMake.addFonts(roboto as never);
pdfMake.addFonts({
  ZillaSlab: { normal: ZILLA_SLAB_TTF, bold: ZILLA_SLAB_TTF },
  WorkSans: { normal: WORK_SANS_REGULAR_TTF, bold: WORK_SANS_BOLD_TTF },
});
// Invoice documents only ever contain static text/tables and the bundled
// Roboto/Zilla Slab/Work Sans font files — never trust or fetch any other
// external/local content while rendering them.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(
  (path: string) =>
    path.startsWith(BUNDLED_FONTS_DIR) || ATELIER_FONTS_DIRS.some((dir) => path.startsWith(dir)),
);

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
        // Phase 9.5: a MANUAL invoice has no lines/serviceLines at all — its
        // whole body is the free-form manualTable instead.
        data.entryMode === 'MANUAL' ? this.buildManualTable(data) : this.buildLinesTable(data),
        ...(data.entryMode === 'GUIDED' && data.serviceLines.length > 0
          ? [{ text: '\n' }, this.buildServiceLinesTable(data)]
          : []),
        { text: '\n' },
        this.buildTotals(data),
        { text: '\n\n' },
        this.buildFooter(data),
      ],
    };
  }

  // "Atelier sobre" (docs/design-system.md): the only place on the PDF this
  // identity is allowed — the delivered document can afford more warmth
  // than the screens that produced it. Everything below the header (parties,
  // tables, totals, legal footer) stays in the default Roboto/black-and-grey
  // treatment, unaffected.
  private buildHeader(data: InvoicePdfData): Content {
    return {
      stack: [
        {
          columns: [
            {
              text: `${data.documentType === 'DEVIS' ? 'Devis' : 'Facture'} ${data.number}`,
              font: 'ZillaSlab',
              fontSize: 20,
              bold: true,
              color: ATELIER_WALNUT,
            },
            {
              text: `Date : ${data.date.toLocaleDateString('fr-FR')}`,
              font: 'WorkSans',
              alignment: 'right',
              color: ATELIER_INK_SOFT,
            },
          ],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 1.5,
              lineColor: ATELIER_WALNUT,
            },
          ],
          margin: [0, 6, 0, 0],
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
      ...data.customerFields.map((field) => `${field.label} : ${field.value}`),
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

  // Phase 9.5: renders a MANUAL invoice's free-form table — column count and
  // labels are whatever the artisan defined on the canvas (always at least
  // Description/Quantité/Prix unitaire), plus a synthetic trailing "Total"
  // column this method computes the display string for (the one number in
  // a manual row PdfService actually formats, everything else is rendered
  // exactly as typed — see InvoicePdfManualRow).
  private buildManualTable(data: InvoicePdfData): Content {
    const table = data.manualTable!;
    const header = [...table.columns.map((column) => column.label), 'Total'];
    const rows = table.rows.map((row: InvoicePdfManualRow) => [
      ...row.cells,
      centsToEuros(row.totalCents),
    ]);

    return {
      table: {
        headerRows: 1,
        widths: [...table.columns.map(() => '*'), 'auto'],
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
      // The art. 293 B citation is only accurate when the issuing company
      // itself is under the franchise en base — a manual invoice whose
      // vatApplicable was overridden away from that (see
      // InvoiceMapper.issuerFields) gets the plain mention instead, never a
      // legal basis that doesn't actually apply to that company.
      data.vatApplicable
        ? undefined
        : data.companyVatExempt
          ? 'TVA non applicable, art. 293 B du CGI.'
          : 'TVA non applicable.',
      "En cas de retard de paiement, une indemnité forfaitaire de 40€ pour frais de recouvrement est due, ainsi qu'une pénalité de retard calculée au taux d'intérêt légal en vigueur.",
    ].filter((mention): mention is string => Boolean(mention));

    return { text: mentions.join('\n'), fontSize: 7, color: '#555555' };
  }
}
