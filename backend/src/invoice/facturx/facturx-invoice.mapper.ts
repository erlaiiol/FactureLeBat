import type { Models } from '@stafyniaksacha/facturx';
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models';

// `Models` is a namespace of class constructors (TradePartyType, AmountType,
// …) — `typeof` turns it into an object type this file can use as a plain
// parameter annotation, since a namespace itself isn't a valid type.
type FacturxModels = typeof Models;
import {
  InvoicePdfData,
  InvoicePdfLine,
  InvoicePdfServiceLine,
} from '../pdf/invoice-pdf-data.interface';
import {
  FACTURX_GUIDELINE_URN_BASIC,
  INVOICE_DOCUMENT_TYPE_CODE,
  TAX_TYPE_VAT,
  VAT_CATEGORY_EXEMPT,
  VAT_CATEGORY_NOT_SUBJECT,
  VAT_CATEGORY_REVERSE_CHARGE,
  VAT_CATEGORY_STANDARD_RATE,
} from './facturx-code-lists.util';

// Phase 1.2-3 (2026 e-invoicing reform): builds the Cross Industry Invoice
// model @stafyniaksacha/facturx serializes to XML and embeds into a PDF/A-3
// hybrid — from the exact same InvoicePdfData already driving pdfmake
// (invoice/pdf/invoice-pdf-data.interface.ts), per this phase's own
// "derived, never persisted, single source of truth" decision in
// docs/roadmap.md. FACTURE-only: a DEVIS is a quote, not a fiscal invoice,
// and the reform (and this document's own UNTDID 1001 typeCode) doesn't
// apply to it — see FacturXService.generateHybridPdf for the gate.

function toEuros(cents: number): number {
  return Math.round(cents) / 100;
}

// yyyyMMdd, format qualifier "102" per UNTDID 2379 — the CII date format
// this library's own examples use for issueDateTime/dueDateDateTime.
function toCiiDateString(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

// This app computes exactly one VAT rate/applicability per invoice (never
// per-line — see roadmap.md Phase 1.2-3's Architecture note on why this
// stays BASIC profile, not EN16931/EXTENDED), so every line and the
// document-level breakdown all share this one category/rate resolution.
function resolveVatCategory(data: InvoicePdfData): {
  categoryCode: string;
  // undefined (not 0) for "O" — BR-O-05 forbids the rate element from being
  // present at all on a "Not subject to VAT" line. Explicit 0 for "E" and
  // "AE" — their own rules (BR-E-05/BR-48) require a rate to be present,
  // reading zero, not omitted. See VAT_CATEGORY_EXEMPT's own comment for
  // where these constraints come from.
  ratePercent?: number;
  exemptionReason?: string;
} {
  if (data.vatApplicable) {
    return { categoryCode: VAT_CATEGORY_STANDARD_RATE, ratePercent: data.vatRateBasisPoints / 100 };
  }
  if (data.reverseChargeApplicable) {
    return {
      categoryCode: VAT_CATEGORY_REVERSE_CHARGE,
      ratePercent: 0,
      exemptionReason: 'Autoliquidation - Article 283-2 du CGI',
    };
  }
  // vatApplicable is false for some other reason — either companyVatExempt
  // (franchise en base) or a MANUAL invoice's own vatApplicableOverride on
  // an otherwise VAT-liable company (see CreateInvoiceDto.vatApplicable
  // Override). Which of "E"/"O" applies is keyed off whether the seller has
  // a real VAT number to declare, not off companyVatExempt directly — see
  // VAT_CATEGORY_EXEMPT's own comment for why (a bug fixed here 2026-08-23
  // had this branch always emit "O" with a hardcoded art. 293 B citation,
  // which both cites a false legal basis for a non-franchise override *and*
  // fails BR-O-02 outright whenever the seller does have a VAT number).
  if (data.issuerVatNumber) {
    return {
      categoryCode: VAT_CATEGORY_EXEMPT,
      ratePercent: 0,
      exemptionReason: 'TVA non applicable',
    };
  }
  return {
    categoryCode: VAT_CATEGORY_NOT_SUBJECT,
    exemptionReason: data.companyVatExempt
      ? 'TVA non applicable - Article 293 B du CGI'
      : 'TVA non applicable',
  };
}

function buildParty(
  m: FacturxModels,
  params: {
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    siret?: string | null;
    vatNumber?: string | null;
  },
): InstanceType<FacturxModels['TradePartyType']> {
  return new m.TradePartyType({
    name: new m.TextType({ value: params.name }),
    specifiedLegalOrganization: params.siret
      ? new m.LegalOrganizationType({
          // ISO 6523 ICD "0002" = FR:SIRENE — the standard scheme id for a
          // French SIRET/SIREN identifier in EN16931/Peppol-family CII.
          id: new m.IDType({ value: params.siret, schemeID: '0002' }),
        })
      : undefined,
    postalTradeAddress: new m.TradeAddressType({
      lineOne: params.addressLine1 ? new m.TextType({ value: params.addressLine1 }) : undefined,
      lineTwo: params.addressLine2 ? new m.TextType({ value: params.addressLine2 }) : undefined,
      cityName: params.city ? new m.TextType({ value: params.city }) : undefined,
      postcodeCode: params.postalCode ? new m.CodeType({ value: params.postalCode }) : undefined,
      countryID: new m.CountryIDType({ value: 'FR' }),
    }),
    // "VA" (VAT registration number) is the *only* value the Factur-X BASIC
    // profile's own code list allows here (confirmed 2026-08-22 against the
    // library's bundled FACTUR-X_BASIC_codedb.xml, cl id="15": enumeration
    // value="VA" and nothing else) — never fabricate a fallback scheme (e.g.
    // "FC", which the same code list rejects outright) for a party with no
    // real VAT number; an invalid enumeration value fails Schematron louder
    // than simply omitting the element. This is exactly why VAT_CATEGORY_
    // NOT_SUBJECT ("O") is used for franchise en base rather than "E"
    // (Exempt) — "O"'s own rule (BR-O-05) needs no seller identifier at all.
    // **Known remaining gap**: a franchise-en-base seller (no VAT number)
    // issuing a reverse-charge ("AE") line still can't satisfy BR-AE-02,
    // which only accepts "VA" here too, with no "O"-style escape — reverse
    // charge inherently presumes a VAT-registered seller shifting liability
    // to the buyer, so this reflects a genuine real-world edge case (a
    // franchise-en-base artisan invoicing reverse-charge) rather than a
    // mapping bug; flagged for follow-up rather than silently worked around.
    specifiedTaxRegistration: params.vatNumber
      ? [
          new m.TaxRegistrationType({
            id: new m.IDType({ value: params.vatNumber, schemeID: 'VA' }),
          }),
        ]
      : undefined,
  });
}

function buildProductLine(
  m: FacturxModels,
  lineId: string,
  description: string,
  unitCode: string,
  quantity: number,
  unitPriceEuros: number,
  totalEuros: number,
  vat: { categoryCode: string; ratePercent?: number },
): InstanceType<FacturxModels['SupplyChainTradeLineItemType']> {
  return new m.SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new m.DocumentLineDocumentType({
      lineID: new m.IDType({ value: lineId }),
    }),
    specifiedTradeProduct: new m.TradeProductType({ name: new m.TextType({ value: description }) }),
    specifiedLineTradeAgreement: new m.LineTradeAgreementType({
      netPriceProductTradePrice: new m.TradePriceType({
        chargeAmount: new m.AmountType({ value: unitPriceEuros }),
      }),
    }),
    specifiedLineTradeDelivery: new m.LineTradeDeliveryType({
      billedQuantity: new m.QuantityType({ value: quantity, unitCode }),
    }),
    specifiedLineTradeSettlement: new m.LineTradeSettlementType({
      applicableTradeTax: [
        new m.TradeTaxType({
          typeCode: new m.TaxTypeCodeType({ value: TAX_TYPE_VAT }),
          categoryCode: new m.TaxCategoryCodeType({ value: vat.categoryCode }),
          // BR-O-05: a "Not subject to VAT" line must not carry a rate at
          // all — omitted (not merely 0) whenever resolveVatCategory leaves
          // ratePercent undefined.
          rateApplicablePercent:
            vat.ratePercent !== undefined
              ? new m.PercentType({ value: vat.ratePercent })
              : undefined,
        }),
      ],
      specifiedTradeSettlementLineMonetarySummation: new m.TradeSettlementLineMonetarySummationType(
        {
          lineTotalAmount: new m.AmountType({ value: totalEuros }),
        },
      ),
    }),
  });
}

export function buildCrossIndustryInvoice(
  m: FacturxModels,
  data: InvoicePdfData,
): CrossIndustryInvoiceType {
  const vat = resolveVatCategory(data);

  const productLines = data.lines.map((line: InvoicePdfLine, index: number) =>
    buildProductLine(
      m,
      String(index + 1),
      line.description,
      // Always the real UN/ECE code, independent of `line.unit` (which
      // blanks to '' whenever the artisan's showUnitDetail toggle is off —
      // see InvoicePdfLine's own comment on unitCode for why the two must
      // never be conflated).
      line.unitCode,
      Number(line.billedQuantity ?? line.quantity),
      toEuros(line.unitPriceCents),
      toEuros(line.totalCents),
      vat,
    ),
  );

  // Only VISIBLE service lines ever reach InvoicePdfData (Phase 5's
  // REDISTRIBUTED ones are already folded into the product lines above by
  // InvoiceMapper) — each becomes its own degenerate one-off line, quantity
  // 1, since this app has no separate unit-price/quantity breakdown for a
  // service line, only its final billed amount.
  const serviceLines = data.serviceLines.map((service: InvoicePdfServiceLine, index: number) =>
    buildProductLine(
      m,
      String(data.lines.length + index + 1),
      service.name,
      'C62', // no real unit to key off — see this function's own callers' comments
      1,
      toEuros(service.amountCents),
      toEuros(service.amountCents),
      vat,
    ),
  );

  // MANUAL mode's freehand canvas has no structured description/quantity/
  // unit-price columns to key off (InvoicePdfManualColumn only carries a
  // display label — see invoice-pdf-data.interface.ts) — each row becomes
  // one degenerate line, its cells joined into the product name, quantity 1,
  // matching this app's existing "MANUAL mode is a free-form canvas, not a
  // structured table" precedent (compare Phase 17's "no per-line
  // categorization for MANUAL" decision).
  const manualLines = (data.manualTable?.rows ?? []).map((row, index) =>
    buildProductLine(
      m,
      String(data.lines.length + data.serviceLines.length + index + 1),
      row.cells.filter(Boolean).join(' — ') || 'Prestation',
      'C62', // no real unit to key off — see this function's own callers' comments
      1,
      toEuros(row.totalCents),
      toEuros(row.totalCents),
      vat,
    ),
  );

  const sellerTradeParty = buildParty(m, {
    name: data.issuerName,
    addressLine1: data.issuerAddressLine1,
    addressLine2: data.issuerAddressLine2,
    city: data.issuerCity,
    postalCode: data.issuerPostalCode,
    siret: data.issuerSiret,
    vatNumber: data.issuerVatNumber,
  });

  const buyerTradeParty = buildParty(m, {
    name: data.customerName,
    addressLine1: data.customerAddress,
    city: null,
    postalCode: null,
    siret: data.customerSiret,
    vatNumber: null,
  });

  // Printed only when it actually differs from customerAddress — same
  // "print only when set/different" convention Phase 1.1-8 established for
  // the PDF's own delivery-address line.
  const shipToTradeParty =
    data.deliveryAddress && data.deliveryAddress !== (data.customerAddress ?? '')
      ? buildParty(m, { name: data.customerName, addressLine1: data.deliveryAddress })
      : undefined;

  const taxBreakdown = [
    new m.TradeTaxType({
      typeCode: new m.TaxTypeCodeType({ value: TAX_TYPE_VAT }),
      categoryCode: new m.TaxCategoryCodeType({ value: vat.categoryCode }),
      rateApplicablePercent:
        vat.ratePercent !== undefined ? new m.PercentType({ value: vat.ratePercent }) : undefined,
      basisAmount: new m.AmountType({ value: toEuros(data.subtotalExclVatCents) }),
      calculatedAmount: new m.AmountType({ value: toEuros(data.vatAmountCents) }),
      exemptionReason: vat.exemptionReason
        ? new m.TextType({ value: vat.exemptionReason })
        : undefined,
    }),
  ];

  // BT-106/BT-107/BT-109 (BR-12/BR-CO-10/BR-CO-13): subtotalExclVatCents is
  // already *after* discounts (see PdfService.buildTotals's own "Sous-total
  // HT" + discountTotalCents = pre-discount line sum) — the header
  // monetary summation needs both the pre-discount line total and the
  // allowance total spelled out explicitly, not just the post-discount
  // basis, or the Schematron cross-check between the header total and the
  // sum of every line's own LineTotalAmount fails.
  const discountTotalCents = data.discountLines.reduce((sum, d) => sum + d.amountCents, 0);
  const lineTotalAmountEuros = toEuros(data.subtotalExclVatCents + discountTotalCents);
  const documentAllowances = data.discountLines.map(
    (discount) =>
      new m.TradeAllowanceChargeType({
        chargeIndicator: new m.IndicatorType({ indicator: false }),
        actualAmount: new m.AmountType({ value: toEuros(discount.amountCents) }),
        reason: new m.TextType({ value: discount.name }),
      }),
  );

  return new m.CrossIndustryInvoiceType({
    exchangedDocumentContext: new m.ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: new m.DocumentContextParameterType({
        id: new m.IDType({ value: FACTURX_GUIDELINE_URN_BASIC }),
      }),
    }),
    exchangedDocument: new m.ExchangedDocumentType({
      id: new m.IDType({ value: data.number }),
      typeCode: new m.DocumentCodeType({ value: INVOICE_DOCUMENT_TYPE_CODE }),
      issueDateTime: new m.DateTimeType({
        dateTimeString: toCiiDateString(data.date),
        format: '102',
      }),
    }),
    supplyChainTradeTransaction: new m.SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: [...productLines, ...serviceLines, ...manualLines],
      applicableHeaderTradeAgreement: new m.HeaderTradeAgreementType({
        sellerTradeParty,
        buyerTradeParty,
      }),
      applicableHeaderTradeDelivery: new m.HeaderTradeDeliveryType({ shipToTradeParty }),
      applicableHeaderTradeSettlement: new m.HeaderTradeSettlementType({
        invoiceCurrencyCode: new m.CurrencyCodeType({ value: 'EUR' }),
        applicableTradeTax: taxBreakdown,
        specifiedTradeAllowanceCharge:
          documentAllowances.length > 0 ? documentAllowances : undefined,
        specifiedTradePaymentTerms: data.dueDate
          ? [
              new m.TradePaymentTermsType({
                dueDateDateTime: new m.DateTimeType({
                  dateTimeString: toCiiDateString(data.dueDate),
                  format: '102',
                }),
              }),
            ]
          : undefined,
        specifiedTradeSettlementHeaderMonetarySummation:
          new m.TradeSettlementHeaderMonetarySummationType({
            lineTotalAmount: new m.AmountType({ value: lineTotalAmountEuros }),
            allowanceTotalAmount:
              discountTotalCents > 0
                ? new m.AmountType({ value: toEuros(discountTotalCents) })
                : undefined,
            taxBasisTotalAmount: new m.AmountType({ value: toEuros(data.subtotalExclVatCents) }),
            taxTotalAmount: [
              new m.AmountType({ value: toEuros(data.vatAmountCents), currencyID: 'EUR' }),
            ],
            grandTotalAmount: new m.AmountType({ value: toEuros(data.totalInclVatCents) }),
            duePayableAmount: new m.AmountType({ value: toEuros(data.totalInclVatCents) }),
          }),
      }),
    }),
  });
}
