import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { InvoicePdfData } from '../pdf/invoice-pdf-data.interface';
import { buildCrossIndustryInvoice } from './facturx-invoice.mapper';

// @stafyniaksacha/facturx is ESM-only (see its package.json's "type":
// "module") while this backend compiles as CommonJS — `await import(...)` is
// the standard, supported way to consume an ESM-only package from CJS, kept
// centralized here rather than sprinkled at every call site.
type FacturxModule = typeof import('@stafyniaksacha/facturx');
let facturxModulePromise: Promise<FacturxModule> | null = null;
function loadFacturx(): Promise<FacturxModule> {
  facturxModulePromise ??= import('@stafyniaksacha/facturx');
  return facturxModulePromise;
}

@Injectable()
export class FacturXService {
  private readonly logger = new Logger(FacturXService.name);

  // Phase 1.2-3 (2026 e-invoicing reform): embeds a Factur-X (BASIC profile)
  // CII XML into the already-rendered pdfmake PDF buffer, producing a
  // PDF/A-3 hybrid file. FACTURE-only — see facturx-invoice.mapper.ts's own
  // header comment for why a DEVIS is out of scope by design, not an
  // oversight; callers (InvoiceController) are expected to have already
  // rejected a DEVIS before reaching here.
  async generateHybridPdf(pdfBuffer: Buffer, data: InvoicePdfData): Promise<Buffer> {
    const { Models, invoiceToXml, check, generate } = await loadFacturx();

    const invoice = buildCrossIndustryInvoice(Models, data);
    const xmlDoc = await invoiceToXml(invoice);
    // Serialized to a plain string before ever being handed back into this
    // same library — passing the live XmlDocument instance straight into
    // check()/generate() was found (2026-08-22) to corrupt validation state
    // and produce a spurious "root element not expected" XSD failure on an
    // otherwise-valid document; re-parsing from a string sidesteps it
    // entirely and is what this file relies on being safe.
    const xml = xmlDoc.toString();

    // Validate before embedding — a malformed file failing silently at the
    // PA (Phase 1.2-4) would be a materially worse failure mode than
    // catching it here, per this phase's own stated Feature in
    // docs/roadmap.md. Schematron enforces the EN 16931 BR-* business rules
    // on top of the plain XSD structure check.
    const result = await check({ xml, flavor: 'facturx', level: 'basic', schematron: true });
    // A "warning"-flagged Schematron assertion (e.g. PEPPOL-EN16931-R008 on
    // this app's always-present-but-often-empty ApplicableHeaderTradeDelivery
    // element, required by the BASIC XSD's own type shape regardless of
    // whether a delivery address was actually set) is advisory, not a
    // conformance failure — checked separately from result.valid/
    // schematronValid, which the library sets to false for *any* Schematron
    // assertion regardless of its own severity flag (confirmed 2026-08-22:
    // an otherwise fully valid document with only a "warning"-flagged
    // assertion still comes back with valid: false).
    const fatalSchematronErrors = (result.schematronErrors ?? []).filter(
      (e) => e.flag !== 'warning',
    );
    if (result.errors.length > 0 || fatalSchematronErrors.length > 0) {
      this.logger.error(
        `Factur-X validation failed for invoice ${data.number}: ${JSON.stringify({
          errors: result.errors,
          fatalSchematronErrors,
        })}`,
      );
      throw new UnprocessableEntityException(
        "La facture électronique n'a pas pu être générée : le document ne respecte pas le schéma Factur-X.",
      );
    }

    // pdfmake's own output already sets a trailer /ID — generate() has an
    // explicit, unimplemented guard against that ("Not implemented yet:
    // Document ID already set", confirmed 2026-08-22) and refuses any PDF
    // that already has one. Loading the buffer with pdf-lib ourselves and
    // clearing it first is the workaround: generate() accepts an already-
    // parsed PDFDocument and skips re-parsing it, so this is the one chance
    // to fix the trailer before its own check runs.
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.context.trailerInfo.ID = undefined;

    const hybridPdfBytes = await generate({
      pdf: pdfDoc,
      xml,
      flavor: 'facturx',
      level: 'basic',
    });
    return Buffer.from(hybridPdfBytes);
  }
}
