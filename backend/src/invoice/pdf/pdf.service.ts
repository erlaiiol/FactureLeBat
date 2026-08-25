import { dirname } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { NatureOperation } from '../../../generated/prisma/enums';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const roboto = require('pdfmake/fonts/Roboto') as Record<string, unknown>;
import { FACTURELE_WATERMARK_LOGO_BASE64 } from './facturele-watermark-logo';
import {
  InvoicePdfData,
  InvoicePdfDiscountLine,
  InvoicePdfLine,
  InvoicePdfManualRow,
  InvoicePdfServiceLine,
} from './invoice-pdf-data.interface';
import { ReportPdfData } from './report-pdf-data.interface';

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

// Phase 1.1-8 (2026 e-invoicing reform): "nature de l'opération" — see
// NatureOperation's own comment (schema.prisma) for GUIDED-derived vs
// MANUAL-selected. PdfService only ever formats the already-resolved enum
// value InvoiceMapper hands it, same "plain text rendering" boundary as
// UNIT_LABELS elsewhere in this pipeline.
const NATURE_OPERATION_LABELS: Record<NatureOperation, string> = {
  LIVRAISON_BIENS: 'Livraison de biens',
  PRESTATION_SERVICES: 'Prestation de services',
  BIENS_ET_SERVICES: 'Livraison de biens et prestation de services',
};

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
  private static readonly logger = new Logger(PdfService.name);

  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    try {
      return await pdfMake.createPdf(this.buildDocDefinition(data)).getBuffer();
    } catch (error) {
      // The artisan's uploaded logo is only best-effort validated at upload
      // time (CompanyController.uploadLogo checks mimetype + magic bytes,
      // not full image integrity) — a file pdfMake still can't decode must
      // never break every future invoice/devis this company generates.
      // Retry once without it rather than surfacing a 500 for a problem the
      // artisan has no way to self-diagnose from here.
      if (data.issuerLogo || data.signature) {
        PdfService.logger.warn(
          `PDF generation failed with issuer logo/signature attached, retrying without them: ${String(error)}`,
        );
        return pdfMake
          .createPdf(this.buildDocDefinition({ ...data, issuerLogo: null, signature: null }))
          .getBuffer();
      }
      throw error;
    }
  }

  // Phase 17: the quarterly report's PDF export — reuses this same
  // pdfMake instance/font setup, but a document shape of its own (no
  // parties/lines table), so it's built independently of
  // buildDocDefinition rather than shoehorned into it.
  async generateReportPdf(data: ReportPdfData): Promise<Buffer> {
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      content: [
        this.buildReportHeader(data),
        { text: '\n' },
        ...(data.plafondWarning
          ? [this.buildPlafondWarning(data.plafondWarning), { text: '\n' }]
          : []),
        this.buildReportCategoryTable(data),
        { text: '\n' },
        this.buildEstimatedCharges(data.estimatedCharges),
        { text: '\n' },
        this.buildReportInvoiceTable(data),
      ],
    };
    return pdfMake.createPdf(docDefinition).getBuffer();
  }

  private buildReportHeader(data: ReportPdfData): Content {
    return {
      stack: [
        {
          columns: [
            {
              text: 'Rapport trimestriel',
              font: 'ZillaSlab',
              fontSize: 20,
              bold: true,
              color: ATELIER_WALNUT,
            },
            { text: data.issuerName, alignment: 'right', color: ATELIER_INK_SOFT },
          ],
        },
        { text: data.periodLabel, color: ATELIER_INK_SOFT, margin: [0, 2, 0, 0] },
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
        {
          text: `Total encaissé HT : ${centsToEuros(data.totalExclVatCents)}`,
          bold: true,
          fontSize: 12,
          margin: [0, 10, 0, 0],
        },
      ],
    };
  }

  private buildPlafondWarning(warning: NonNullable<ReportPdfData['plafondWarning']>): Content {
    return {
      text: `Plafond micro-entrepreneur : ${centsToEuros(warning.yearToDateCents)} encaissés cette année sur ${centsToEuros(warning.ceilingCents)} (${warning.percentageUsed} %).`,
      fontSize: 9,
      color: '#555555',
    };
  }

  private buildReportCategoryTable(data: ReportPdfData): Content {
    const header = ['Catégorie', 'Montant HT'];
    const rows = data.categories.map((entry) => [
      entry.label,
      centsToEuros(entry.totalExclVatCents),
    ]);
    return {
      table: { headerRows: 1, widths: ['*', 'auto'], body: [header, ...rows] },
    };
  }

  // Phase 17 (charges estimate): always labelled as an estimate, and honest
  // about when it doesn't apply — see EstimatedCharges' own comment
  // (reports module) for why a COMPANY gets a message instead of a guess.
  private buildEstimatedCharges(charges: ReportPdfData['estimatedCharges']): Content {
    const heading: Content = {
      text: 'Estimation des charges (cotisations sociales, à titre indicatif)',
      bold: true,
      fontSize: 11,
      margin: [0, 0, 0, 4],
    };

    if (!charges.applicable) {
      return {
        stack: [
          heading,
          {
            text: "Non disponible pour ce statut — l'impôt d'une société dépend de ses charges réelles, à calculer avec votre expert-comptable.",
            fontSize: 9,
            color: '#555555',
          },
        ],
      };
    }

    const header = ['Catégorie', 'Montant HT', 'Taux', 'Cotisation estimée'];
    const rows = charges.rows.map((entry) => [
      entry.label,
      centsToEuros(entry.totalExclVatCents),
      entry.cotisationRatePercent,
      centsToEuros(entry.cotisationCents),
    ]);
    const totalLines = [
      `Total cotisations sociales estimées : ${centsToEuros(charges.cotisationsSocialesCents)}`,
      ...(charges.versementLiberatoireOptIn
        ? [`Versement libératoire estimé : ${centsToEuros(charges.versementLiberatoireCents)}`]
        : []),
      `Total estimé : ${centsToEuros(charges.totalEstimatedCents)}`,
    ];

    return {
      stack: [
        heading,
        {
          table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: [header, ...rows] },
        },
        { text: totalLines.join('\n'), bold: true, fontSize: 10, margin: [0, 6, 0, 0] },
        ...(charges.uncategorizedExclVatCents > 0
          ? [
              {
                text: `Dont ${centsToEuros(charges.uncategorizedExclVatCents)} non catégorisé, exclu de cette estimation.`,
                fontSize: 8,
                color: '#555555',
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
        {
          text: 'Estimation indicative, sans valeur légale — vérifiez le montant exact sur urssaf.fr ou avec votre expert-comptable.',
          fontSize: 8,
          italics: true,
          color: '#555555',
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  private buildReportInvoiceTable(data: ReportPdfData): Content {
    const header = ['Numéro', 'Client', "Date d'encaissement", 'Montant TTC'];
    const rows = data.invoices.map((invoice) => [
      invoice.number,
      invoice.customerName,
      invoice.paidAt.toLocaleDateString('fr-FR'),
      centsToEuros(invoice.totalInclVatCents),
    ]);
    return {
      table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto'], body: [header, ...rows] },
    };
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
        ...(data.signature ? [{ text: '\n' }, this.buildSignatureBlock(data)] : []),
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
        // The artisan's own uploaded logo (Company > CompanyLogo, see
        // schema.prisma) — its own row above the title/date so it can never
        // overlap them regardless of its aspect ratio; a plain flex spacer
        // column docks it against the same right margin the rest of the
        // document respects, rather than an absolutely-positioned overlay
        // that would need to be re-tuned by hand for every logo shape.
        ...(data.issuerLogo
          ? [
              {
                columns: [
                  { text: '', width: '*' },
                  { image: data.issuerLogo.base64, fit: [90, 50] as [number, number] },
                ],
                margin: [0, 0, 0, 6] as [number, number, number, number],
              },
            ]
          : []),
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
      // Phase 1.2-2: printed only when set, same "print only when set"
      // convention as deliveryAddress's conditional line (Phase 1.1-8) —
      // never rendered for a franchise-en-base company with no VAT number.
      data.issuerVatNumber ? `N° TVA : ${data.issuerVatNumber}` : '',
      data.issuerEmail ?? '',
      data.issuerPhone ?? '',
    ].filter(Boolean);

    const customerLines = [
      data.customerName,
      data.customerAddress ?? '',
      // Phase 1.1-8 (2026 e-invoicing reform): SIREN is the first 9 digits
      // of the SIRET — no separate field needed, a SIRET already contains
      // it.
      data.customerSiret ? `SIREN : ${data.customerSiret.slice(0, 9)}` : '',
      data.customerEmail ?? '',
      data.customerPhone ?? '',
      // Printed only when it actually differs from the billing address
      // above — an untouched invoice's deliveryAddress starts identical to
      // customerAddress by default (see InvoiceDraftStore), so nothing
      // extra renders unless the artisan explicitly edited it.
      data.deliveryAddress && data.deliveryAddress !== (data.customerAddress ?? '')
        ? `Adresse de livraison : ${data.deliveryAddress}`
        : '',
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

  // Phase 23: simplifiedDisplay collapses this down to just Description +
  // Total — an artisan-chosen, document-level toggle (see InvoicePdfData.
  // simplifiedDisplay), never the default. Header/widths/each row's cells
  // must shrink together, so both column sets are built as whole arrays
  // rather than filtering a fixed 5-column shape after the fact.
  private buildLinesTable(data: InvoicePdfData): Content {
    if (data.simplifiedDisplay) {
      const header = ['Description', 'Total'];
      const rows = data.lines.map((line: InvoicePdfLine) => [
        line.description,
        centsToEuros(line.totalCents),
      ]);
      return {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [header, ...rows],
        },
      };
    }

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

  // Phase 32: when there's at least one remise, the block grows from
  // "Sous-total HT" straight to "TVA"/"Total TTC" into "Sous-total HT" (the
  // pre-discount sum of lines/services), one row per named remise, and a
  // "Total HT" row (post-discount, the real base VAT is computed on) — kept
  // out of the way entirely (single "Sous-total HT" row, unchanged) for the
  // common case of an invoice with no discount at all.
  private buildTotals(data: InvoicePdfData): Content {
    const discountTotalCents = data.discountLines.reduce(
      (sum, discount: InvoicePdfDiscountLine) => sum + discount.amountCents,
      0,
    );

    const rows: [string, string][] = [];
    if (discountTotalCents > 0) {
      rows.push(['Sous-total HT', centsToEuros(data.subtotalExclVatCents + discountTotalCents)]);
      for (const discount of data.discountLines) {
        rows.push([discount.name, centsToEuros(-discount.amountCents)]);
      }
      rows.push(['Total HT', centsToEuros(data.subtotalExclVatCents)]);
    } else {
      rows.push(['Sous-total HT', centsToEuros(data.subtotalExclVatCents)]);
    }

    if (data.vatApplicable) {
      const vatRate = (data.vatRateBasisPoints / 100).toFixed(2);
      rows.push([`TVA (${vatRate} %)`, centsToEuros(data.vatAmountCents)]);
    }

    rows.push(['Total TTC', centsToEuros(data.totalInclVatCents)]);

    // Phase 1.1-3: only rendered when a deposit was actually requested —
    // pixel-identical to today when none was, same "only render when
    // present" precedent as the discount rows above.
    if (data.depositPercentageBasisPoints !== null && data.depositAmountCents !== null) {
      const depositRate = (data.depositPercentageBasisPoints / 100).toFixed(2);
      rows.push([
        'Acompte demandé',
        `${depositRate} % soit ${centsToEuros(data.depositAmountCents)}`,
      ]);
      if (data.depositPaidAt) {
        rows.push(['Acompte réglé le', data.depositPaidAt.toLocaleDateString('fr-FR')]);
      }
    }

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

  // Phase 1.1-1: the attached signature proof (drawn or photographed),
  // right-aligned under the totals like a real signed document — composited
  // fresh from InvoiceSignature.image on every render, same "derived at
  // render time, not cached" rule as the rest of this pipeline. Only called
  // when data.signature is present (see buildDocDefinition).
  private buildSignatureBlock(data: InvoicePdfData): Content {
    return {
      columns: [
        { text: '', width: '*' },
        {
          stack: [
            { text: 'Signature', fontSize: 8, color: '#555555', alignment: 'center' },
            { image: data.signature!.base64, fit: [140, 70] as [number, number] },
          ],
          alignment: 'center',
        },
      ],
    };
  }

  private buildFooter(data: InvoicePdfData): Content {
    // Phase 1.1-7: Art. L441-9 du Code de commerce only governs commercial
    // relations between professionals — none of the four mentions gated on
    // this apply to a DEVIS (a quote, not a facture) or to an individual
    // consumer, regardless of what data.customerIsProfessional says for a
    // DEVIS's own linked customer.
    const isProfessionalFacture = data.documentType === 'FACTURE' && data.customerIsProfessional;

    const mentions = [
      // The art. 293 B citation is only accurate when the issuing company
      // itself is under the franchise en base — a manual invoice whose
      // vatApplicable was overridden away from that (see
      // InvoiceMapper.issuerFields) gets the plain mention instead, never a
      // legal basis that doesn't actually apply to that company.
      // Phase 1.1-7: reverseChargeApplicable takes precedence over both —
      // when the invoice's own zero-VAT treatment comes from autoliquidation
      // rather than the company's general franchise-en-base status, only the
      // autoliquidation citation is accurate for this specific document.
      data.vatApplicable
        ? undefined
        : data.reverseChargeApplicable
          ? "Autoliquidation - Article 242 nonies A, 13° de l'annexe II au CGI."
          : data.companyVatExempt
            ? 'TVA non applicable, art. 293 B du CGI.'
            : 'TVA non applicable.',
      // Phase 1.1-7: previously shown unconditionally — L441-9's 40€
      // indemnité forfaitaire only governs professional-to-professional
      // sales, so an individual-consumer client (or any DEVIS) must never
      // see it.
      isProfessionalFacture
        ? "En cas de retard de paiement, une indemnité forfaitaire de 40€ pour frais de recouvrement est due, ainsi qu'une pénalité de retard calculée au taux d'intérêt légal en vigueur."
        : undefined,
      // Art. L441-9's own required "date/délai de règlement" mention — the
      // first time dueDate is rendered as this, rather than only driving the
      // "en retard" board logic (Phase 16).
      isProfessionalFacture && data.dueDate
        ? `Délai de règlement : ${data.dueDate.toLocaleDateString('fr-FR')}`
        : undefined,
      // Art. L441-9 requires *stating* the escompte policy even when there
      // isn't one — see schema.prisma's comment on
      // Company.earlyPaymentDiscountMention for why this is almost never
      // null in practice.
      isProfessionalFacture && data.earlyPaymentDiscountMention
        ? data.earlyPaymentDiscountMention
        : undefined,
      // BTP mandatory mention (art. L243-2 du Code des assurances) — see
      // InvoiceMapper.issuerFields for when decennialInsurance is non-null.
      data.decennialInsurance
        ? `Assurance de responsabilité civile décennale souscrite auprès de ${data.decennialInsurance.insurerName}, police n°${data.decennialInsurance.policyNumber}, couvrant les chantiers situés en ${data.decennialInsurance.coverageArea}.`
        : undefined,
      // Phase 1.1-8 (2026 e-invoicing reform): always present, both
      // document types — data.natureOfOperation is never null (see
      // InvoiceMapper), so this line always renders.
      `Nature de l'opération : ${NATURE_OPERATION_LABELS[data.natureOfOperation]}.`,
      // Same FACTURE-only scope as the L441-9 mentions above — a devis
      // collects no tax, so the débits option is meaningless there.
      data.documentType === 'FACTURE' && data.vatOnDebitsOption
        ? "Option pour le paiement de la taxe sur la valeur ajoutée d'après les débits."
        : undefined,
    ].filter((mention): mention is string => Boolean(mention));

    return {
      stack: [
        { text: mentions.join('\n'), fontSize: 7, color: '#555555' },
        // Phase 1.1-6: the artisan's own free-text mention — already
        // resolved against this document's type by
        // InvoiceMapper.issuerFields, so null here just means "off or
        // empty, render nothing". Centered and a touch larger than the
        // statutory-citation stack above on purpose: these are the
        // artisan's own words, not a legal citation, so they get a
        // distinct, more prominent visual treatment rather than blending
        // into the 7pt legal-mentions block.
        ...(data.customFooterMessage
          ? [
              {
                text: data.customFooterMessage,
                fontSize: 8,
                color: '#555555',
                alignment: 'center' as const,
                margin: [0, 8, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
        // facturele.net signature — every invoice/devis carries it unless
        // the issuing company's effective plan tier removes it (see
        // PLAN_DEFINITIONS.removesWatermark, InvoiceMapper.issuerFields).
        // Site address centered, small brand mark below — never a link,
        // just a plain mention, since this PDF is a static document handed
        // to the artisan's own client.
        ...(data.showWatermark ? [this.buildWatermark()] : []),
      ],
    };
  }

  private buildWatermark(): Content {
    return {
      stack: [
        {
          text: 'facturele.net',
          alignment: 'center',
          fontSize: 8,
          color: '#999999',
          margin: [0, 16, 0, 3],
        },
        {
          image: FACTURELE_WATERMARK_LOGO_BASE64,
          fit: [20, 20],
          alignment: 'center',
        },
      ],
    };
  }
}
