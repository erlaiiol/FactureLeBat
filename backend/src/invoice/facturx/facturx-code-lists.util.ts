// Phase 1.2-3 (2026 e-invoicing reform): the small, closed set of standardized
// EDI code lists a Cross Industry Invoice needs — kept here rather than
// inline in the mapper so each one has a single, citable source.

// UN/ECE Recommendation 20 unit codes for product lines now live in
// common/unit.util.ts's UNIT_CODES, keyed by the real `Unit` enum and
// resolved by InvoiceMapper onto InvoicePdfLine.unitCode — not here, and
// deliberately not by the display label (`InvoicePdfLine.unit`), which
// blanks to '' whenever the artisan's showUnitDetail toggle is off. A
// service/MANUAL-mode degenerate line (no real unit to key off at all)
// uses the literal 'C62' ("one") directly at its call site in
// facturx-invoice.mapper.ts.

// UNTDID 1001 document-type code. This app only ever generates a Factur-X
// for a FACTURE (see roadmap.md Phase 1.2-3's correction: a DEVIS is a quote,
// not a fiscal invoice, and the reform doesn't apply to it) — "380" is the
// single code this module ever emits.
export const INVOICE_DOCUMENT_TYPE_CODE = '380'; // Commercial invoice

// UNTDID 5305 VAT category codes.
export const VAT_CATEGORY_STANDARD_RATE = 'S'; // Standard rate
// The choice between "E" (Exempt) and "O" (Not subject to VAT) for a
// zero-VAT, non-reverse-charge line is **not** simply "franchise en base or
// not" — it's gated by whether the seller has a real VAT number to put on
// the document, confirmed empirically 2026-08-23 against this library's own
// BASIC-profile Schematron:
//   - "E" requires the Seller VAT/tax-registration identifier to be
//     *present* (BR-E-02) and the line's rate to be explicitly 0, not
//     omitted (BR-E-05/BR-48).
//   - "O" requires the *opposite* on both counts: no Seller/Buyer VAT
//     identifier anywhere in the document at all (BR-O-02) and no rate
//     element present (BR-O-05).
// A franchise-en-base artisan (Company.vatNumber null) has no VAT number to
// offer, so only "O" is satisfiable for them — but `companyVatExempt` alone
// isn't the right switch either: a micro-entrepreneur can cross the
// franchise threshold mid-year and end up with a real vatNumber despite
// legalStatus still reading MICRO_ENTREPRENEUR, so facturx-invoice.mapper's
// resolveVatCategory keys off `issuerVatNumber`'s presence directly.
export const VAT_CATEGORY_EXEMPT = 'E';
export const VAT_CATEGORY_NOT_SUBJECT = 'O';
export const VAT_CATEGORY_REVERSE_CHARGE = 'AE'; // VAT Reverse Charge (autoliquidation)

// UNTDID 5153 tax type code — always VAT for this app (the only tax it
// ever computes).
export const TAX_TYPE_VAT = 'VAT';

// The five Factur-X guideline URNs (verbatim from the Factur-X 1.0.7/1.09
// specification's GuidelineSpecifiedDocumentContextParameter/ID) — this app
// only ever targets BASIC (see roadmap.md Phase 1.2-3's Architecture note on
// why BASIC, not EN16931/EXTENDED), but all five are recorded here so the
// constant is self-documenting rather than a bare string in the mapper.
export const FACTURX_GUIDELINE_URN_BASIC =
  'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic';
