import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceEntryMode } from '../../generated/prisma/enums';
import { PremiumGateService } from '../billing/premium-gate.service';
import { CompanyService } from '../company/company.service';
import { isVatApplicable } from '../company/legal-status.util';
import { CustomerService } from '../customer/customer.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { InvoiceMapper } from './invoice.mapper';
import {
  CreateInvoiceServiceLineData,
  InvoiceRepository,
  InvoiceWithLines,
} from './invoice.repository';
import { InvoicePdfData } from './pdf/invoice-pdf-data.interface';
import { expandServiceLineWeights } from './redistribution.util';

// Orchestration only: loads the company profile, delegates numbering +
// persistence to the repository, delegates response shaping to the mapper.
// No calculation logic and no Prisma calls live here directly.
@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companyService: CompanyService,
    private readonly customerService: CustomerService,
    private readonly serviceCatalogService: ServiceCatalogService,
    private readonly mapper: InvoiceMapper,
    private readonly premiumGate: PremiumGateService,
  ) {}

  async create(companyId: string, dto: CreateInvoiceDto): Promise<InvoiceWithTotals> {
    // Phase 14: the free trial covers exactly one invoice per company —
    // checked first, before any other work, so a company past its trial
    // never even reaches customer/service-catalog lookups for a doomed
    // request. See docs/roadmap.md Phase 14 and PremiumGateService.
    await this.premiumGate.assertCanCreateInvoice(companyId);

    const company = await this.companyService.getProfile(companyId);

    // Confirms the id exists *for this tenant* (a clean 404 instead of a raw
    // DB foreign-key error on a stale/typo'd id, and — since Phase 13 —
    // instead of silently letting one company's invoice reference another
    // company's customer) without ever overwriting the customer fields
    // below — those stay exactly what the artisan typed/edited on the
    // invoice, even if they diverged from the saved customer record.
    // Unlike CustomerService.update()/ProductService.update(), this
    // check-then-act pair is NOT a TOCTOU race: there is no DELETE
    // /customers endpoint, so nothing can remove the row between this
    // check and the insert below. Revisit this comment if that changes.
    if (dto.customerId) {
      await this.customerService.findById(companyId, dto.customerId);
    }

    // Manual mode (Phase 9.5) has no serviceLines concept at all —
    // ManualModeFieldsConsistency already rejects a request that tries to
    // combine the two, so this can only run for entryMode GUIDED.
    const entryMode = dto.entryMode ?? InvoiceEntryMode.GUIDED;
    const serviceLineDtos = entryMode === InvoiceEntryMode.GUIDED ? (dto.serviceLines ?? []) : [];
    // Same reasoning applies to Service — there is no DELETE /services
    // endpoint either.
    for (const serviceLine of serviceLineDtos) {
      if (serviceLine.serviceId) {
        await this.serviceCatalogService.findById(companyId, serviceLine.serviceId);
      }
    }

    const invoice = await this.invoiceRepository.createWithSequentialNumber({
      companyId: company.id,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      customerId: dto.customerId,
      customerFields: (dto.customerFields ?? []).map((field) => ({
        label: field.label,
        value: field.value,
      })),
      vatApplicable: isVatApplicable(company.legalStatus),
      vatRateBasisPoints: company.vatRateBasisPoints,
      subtotalOverrideCents: dto.subtotalOverrideCents,
      vatOverrideCents: dto.vatOverrideCents,
      totalOverrideCents: dto.totalOverrideCents,
      entryMode,
      // ManualModeFieldsConsistency guarantees `lines` is a non-empty array
      // whenever entryMode is GUIDED (the only branch that reads it below).
      lines:
        entryMode === InvoiceEntryMode.GUIDED
          ? dto.lines!.map((line) => ({
              description: line.description,
              unit: line.unit,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              wasteSurcharge: line.wasteSurcharge,
              packagingQuantity: line.packagingQuantity,
              roundUpToPackaging: line.roundUpToPackaging ?? true,
              productCode: line.productCode,
              showUnitDetail: line.showUnitDetail ?? true,
              showBillingDetail: line.showBillingDetail ?? true,
            }))
          : [],
      serviceLines: serviceLineDtos.map((serviceLine): CreateInvoiceServiceLineData => {
        const weights = expandServiceLineWeights(serviceLine, dto.lines!.length);
        return {
          serviceId: serviceLine.serviceId,
          name: serviceLine.name,
          description: serviceLine.description,
          amountCents: serviceLine.amountCents,
          visibility: serviceLine.visibility,
          weights,
        };
      }),
      // ManualModeFieldsConsistency guarantees `manualTable` is present
      // whenever entryMode is MANUAL (the only branch that reads it below).
      manualColumns:
        entryMode === InvoiceEntryMode.MANUAL
          ? dto.manualTable!.columns.map((column) => ({
              role: column.role,
              label: column.label,
              widthPx: column.widthPx,
            }))
          : undefined,
      manualRows:
        entryMode === InvoiceEntryMode.MANUAL
          ? dto.manualTable!.rows.map((row) => ({ heightPx: row.heightPx, cells: row.cells }))
          : undefined,
    });

    return this.mapper.toInvoiceWithTotals(invoice);
  }

  async findAll(companyId: string): Promise<InvoiceWithTotals[]> {
    const invoices = await this.invoiceRepository.findAll(companyId);
    return invoices.map((invoice) => this.mapper.toInvoiceWithTotals(invoice));
  }

  async findById(companyId: string, id: string): Promise<InvoiceWithTotals> {
    const invoice = await this.findRawById(companyId, id);
    return this.mapper.toInvoiceWithTotals(invoice);
  }

  async getPdfData(companyId: string, id: string): Promise<InvoicePdfData> {
    const invoice = await this.findRawById(companyId, id);
    return this.mapper.toPdfData(invoice);
  }

  // Phase 6: renders a PDF from an unsaved draft (no id, no invoice number
  // yet) so the artisan can preview an invoice at any point before saving —
  // deliberately skips create()'s customerId/serviceId existence checks,
  // since nothing here is persisted and a stale/typo'd id can't corrupt any
  // stored data. Only reads the company profile; touches no other table.
  async previewPdf(companyId: string, dto: CreateInvoiceDto): Promise<InvoicePdfData> {
    // Phase 14: gated identically to create() — the roadmap's "frustrate at
    // the last moment" call is that a 2nd invoice's preview is blocked too,
    // not just its final persistence, since preview is reached at the same
    // late point in the flow (see docs/roadmap.md Phase 14).
    await this.premiumGate.assertCanCreateInvoice(companyId);

    const company = await this.companyService.getProfile(companyId);
    return this.mapper.toPreviewPdfData(dto, company);
  }

  // Phase 15: JSON counterpart of previewPdf, for the mandatory preview
  // screen's HTML mirror — same gate, same not-yet-persisted DTO, same
  // InvoiceWithTotals shape GET /invoices/:id already returns, so the
  // frontend never needs its own copy of the pricing/redistribution math to
  // render per-line figures (see docs/conventions.md's "no business-logic
  // duplication").
  async previewData(companyId: string, dto: CreateInvoiceDto): Promise<InvoiceWithTotals> {
    await this.premiumGate.assertCanCreateInvoice(companyId);

    const company = await this.companyService.getProfile(companyId);
    return this.mapper.toPreviewInvoiceWithTotals(dto, company);
  }

  private async findRawById(companyId: string, id: string): Promise<InvoiceWithLines> {
    const invoice = await this.invoiceRepository.findById(companyId, id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }
}
