import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DocumentType, InvoiceEntryMode, InvoiceStatus } from '../../generated/prisma/enums';
import { PlanGateService } from '../billing/plan-gate.service';
import { CompanyService } from '../company/company.service';
import { isVatApplicable } from '../company/legal-status.util';
import { CustomerService } from '../customer/customer.service';
import { DiscountService } from '../discount/discount.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { InvoiceMapper } from './invoice.mapper';
import {
  CreateInvoiceData,
  CreateInvoiceDiscountLineData,
  CreateInvoiceServiceLineData,
  InvoiceRepository,
  InvoiceWithLines,
} from './invoice.repository';
import { computeNextDocumentNumber } from './next-number.util';
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
    private readonly discountService: DiscountService,
    private readonly mapper: InvoiceMapper,
    private readonly premiumGate: PlanGateService,
  ) {}

  async create(companyId: string, dto: CreateInvoiceDto): Promise<InvoiceWithTotals> {
    // Phase 14: the free trial covers exactly one invoice per company —
    // checked first, before any other work, so a company past its trial
    // never even reaches customer/service-catalog lookups for a doomed
    // request. See docs/roadmap.md Phase 14 and PlanGateService.
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

    // "Créer la facture à partir du devis" (editable flow, see
    // InvoiceDraftStore.loadFromInvoice/ManualInvoiceDraftStore.loadFromInvoice):
    // same lineage/uniqueness guard as convertToFacture below, just reached
    // through the normal create() path since the artisan may have edited
    // the devis's data before submitting.
    if (dto.convertedFromDevisId) {
      const devis = await this.findRawById(companyId, dto.convertedFromDevisId);
      if (devis.documentType !== DocumentType.DEVIS) {
        throw new BadRequestException(`Invoice ${dto.convertedFromDevisId} is not a devis`);
      }
      if (devis.convertedToFacture) {
        throw new BadRequestException(`Devis ${dto.convertedFromDevisId} is already converted`);
      }
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

    // Phase 32: same soft-reference existence check, for a discount line's
    // discountId — there is no DELETE /discounts endpoint either.
    const discountLineDtos = entryMode === InvoiceEntryMode.GUIDED ? (dto.discountLines ?? []) : [];
    for (const discountLine of discountLineDtos) {
      if (discountLine.discountId) {
        await this.discountService.findById(companyId, discountLine.discountId);
      }
    }

    const invoice = await this.createInvoiceRow({
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
      // ManualModeFieldsConsistency guarantees these two overrides are only
      // ever present for entryMode MANUAL, so this can't misfire for a
      // GUIDED invoice.
      vatApplicable: dto.vatApplicableOverride ?? isVatApplicable(company.legalStatus),
      vatRateBasisPoints: dto.vatRateBasisPointsOverride ?? company.vatRateBasisPoints,
      subtotalOverrideCents: dto.subtotalOverrideCents,
      vatOverrideCents: dto.vatOverrideCents,
      totalOverrideCents: dto.totalOverrideCents,
      entryMode,
      documentType: dto.documentType ?? DocumentType.FACTURE,
      convertedFromDevisId: dto.convertedFromDevisId,
      // Phase 27: absent means "use the auto-suggested next number" — see
      // createInvoiceRow/computeNextDocumentNumber.
      number: dto.number,
      simplifiedDisplay: dto.simplifiedDisplay ?? false,
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
              activityCategory: line.activityCategory,
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
          activityCategory: serviceLine.activityCategory,
        };
      }),
      discountLines: discountLineDtos.map((discountLine): CreateInvoiceDiscountLineData => ({
        discountId: discountLine.discountId,
        name: discountLine.name,
        amountCents: discountLine.amountCents,
      })),
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

    // Phase 33: fire-and-observe after the row actually exists — checks its
    // own idempotency (invoiceCount === 1, no plan already), so this is safe
    // to call from both creation paths without duplicating that logic here.
    await this.premiumGate.recordInvoiceCreated(companyId);

    return this.mapper.toInvoiceWithTotals(invoice);
  }

  // Phase 14.3: a devis converts into a real, independently-numbered facture
  // — a new Invoice row (documentType FACTURE, convertedFromDevisId pointing
  // back at the devis), never a mutation of the devis in place, so the devis
  // stays retrievable exactly as it was. Reuses the exact lines/serviceLines/
  // manualTable/customerFields the devis was confirmed with — nothing here is
  // re-typed or re-validated by the artisan, unlike create()'s DTO path.
  async convertToFacture(companyId: string, devisId: string): Promise<InvoiceWithTotals> {
    // Gated first, same "frustrate at the last moment, but check it first"
    // ordering as create() — this is still "creating a facture".
    await this.premiumGate.assertCanCreateInvoice(companyId);

    const devis = await this.findRawById(companyId, devisId);
    if (devis.documentType !== DocumentType.DEVIS) {
      throw new BadRequestException(`Invoice ${devisId} is not a devis`);
    }

    const invoice = await this.createInvoiceRow({
      companyId,
      customerName: devis.customerName,
      customerAddress: devis.customerAddress ?? undefined,
      customerEmail: devis.customerEmail ?? undefined,
      customerPhone: devis.customerPhone ?? undefined,
      customerId: devis.customerId ?? undefined,
      customerFields: devis.customerFields.map((field) => ({
        label: field.label,
        value: field.value,
      })),
      vatApplicable: devis.vatApplicable,
      vatRateBasisPoints: devis.vatRateBasisPoints,
      subtotalOverrideCents: devis.subtotalOverrideCents ?? undefined,
      vatOverrideCents: devis.vatOverrideCents ?? undefined,
      totalOverrideCents: devis.totalOverrideCents ?? undefined,
      entryMode: devis.entryMode,
      documentType: DocumentType.FACTURE,
      convertedFromDevisId: devis.id,
      simplifiedDisplay: devis.simplifiedDisplay,
      lines: devis.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity.toNumber(),
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity?.toNumber(),
        roundUpToPackaging: line.roundUpToPackaging,
        productCode: line.productCode ?? undefined,
        showUnitDetail: line.showUnitDetail,
        showBillingDetail: line.showBillingDetail,
        activityCategory: line.activityCategory ?? undefined,
      })),
      serviceLines: devis.serviceLines.map((serviceLine): CreateInvoiceServiceLineData => ({
        serviceId: serviceLine.serviceId ?? undefined,
        name: serviceLine.name,
        description: serviceLine.description ?? undefined,
        amountCents: serviceLine.amountCents,
        visibility: serviceLine.visibility,
        activityCategory: serviceLine.activityCategory ?? undefined,
        weights:
          serviceLine.visibility === 'REDISTRIBUTED'
            ? devis.lines.map(
                (line) =>
                  serviceLine.weights.find((weight) => weight.invoiceLineId === line.id)?.weight ??
                  0,
              )
            : undefined,
      })),
      discountLines: devis.discountLines.map((discountLine): CreateInvoiceDiscountLineData => ({
        discountId: discountLine.discountId ?? undefined,
        name: discountLine.name,
        amountCents: discountLine.amountCents,
      })),
      manualColumns:
        devis.entryMode === InvoiceEntryMode.MANUAL
          ? devis.manualColumns.map((column) => ({
              role: column.role,
              label: column.label,
              widthPx: column.widthPx ?? undefined,
            }))
          : undefined,
      manualRows:
        devis.entryMode === InvoiceEntryMode.MANUAL
          ? devis.manualRows.map((row) => ({
              heightPx: row.heightPx ?? undefined,
              // Rebuilt positionally against manualColumns (not the raw
              // `cells` array order, which INVOICE_INCLUDE doesn't sort) —
              // same columnId-matching CreateManualRowData's cells[i]
              // convention requires.
              cells: devis.manualColumns.map(
                (column) => row.cells.find((cell) => cell.columnId === column.id)?.value ?? '',
              ),
            }))
          : undefined,
    });

    // Phase 33: see create() above — a no-op in practice here, since a
    // company able to reach this point (an existing devis to convert)
    // already has invoiceCount >= 1 from that devis alone, so this can never
    // be the invoiceCount 0 -> 1 transition the trial offer is keyed on.
    await this.premiumGate.recordInvoiceCreated(companyId);

    return this.mapper.toInvoiceWithTotals(invoice);
  }

  // Phase 16: the board's drag/button status changes, and a due-date-only
  // edit from an existing card (same status, new dueDate). A devis has no
  // payment lifecycle — see docs/roadmap.md Phase 16's cross-reference to
  // Phase 14.3 — so this rejects anything but a FACTURE up front, same
  // "wrong document type" guard shape as convertToFacture above.
  async updateStatus(
    companyId: string,
    id: string,
    dto: UpdateInvoiceStatusDto,
  ): Promise<InvoiceWithTotals> {
    const invoice = await this.findRawById(companyId, id);
    if (invoice.documentType !== DocumentType.FACTURE) {
      throw new BadRequestException(`Invoice ${id} is not a facture`);
    }

    // paidAt records the fact of being marked PAYEE, same "records the fact,
    // not a log" convention as sentAt: set on entering PAYEE, cleared when
    // dragged/moved back out to any other status, left untouched otherwise
    // (e.g. NON_PAYEE -> NON_PAYEE with just a new dueDate).
    const paidAt =
      dto.status === InvoiceStatus.PAYEE
        ? (invoice.paidAt ?? new Date())
        : dto.status !== invoice.status
          ? null
          : invoice.paidAt;

    const updated = await this.invoiceRepository.updateStatus(companyId, id, {
      status: dto.status,
      // dto.dueDate omitted means "leave it exactly as it is" (e.g. an
      // artisan re-dragging a card that already has a due date) — never
      // silently cleared by an update that isn't about the due date at all.
      dueDate: dto.dueDate !== undefined ? new Date(dto.dueDate) : undefined,
      paidAt,
    });

    return this.mapper.toInvoiceWithTotals(updated);
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
    const [invoice, logo] = await Promise.all([
      this.findRawById(companyId, id),
      this.companyService.getLogo(companyId),
    ]);
    return this.mapper.toPdfData(invoice, logo);
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

    const [company, logo] = await Promise.all([
      this.companyService.getProfile(companyId),
      this.companyService.getLogo(companyId),
    ]);
    return this.mapper.toPreviewPdfData(dto, company, logo);
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

  // Phase 27: the suggestion shown on the "numéro" field before the artisan
  // has typed anything of their own — same computation
  // createInvoiceRow/createWithSequentialNumber falls back to when no
  // explicit number is submitted, just read outside any transaction/lock
  // since nothing is being reserved yet (see InvoiceRepository.findNumbers).
  async getNextNumber(companyId: string, documentType: DocumentType): Promise<{ number: string }> {
    const company = await this.companyService.getProfile(companyId);
    const existing = await this.invoiceRepository.findNumbers(companyId, documentType);
    const prefix =
      documentType === DocumentType.DEVIS ? company.devisNumberPrefix : company.invoiceNumberPrefix;
    return { number: computeNextDocumentNumber(prefix, existing) };
  }

  // Thin wrapper shared by create()/convertToFacture(): turns the DB's
  // unique-constraint violation (an artisan's custom number already used,
  // or — vanishingly unlikely given the row lock — a race on the
  // auto-computed one) into a clean 409, same
  // ProductService.mapKnownError/P2002 convention used elsewhere in this
  // codebase, instead of an unhandled 500 from the raw DB error.
  private async createInvoiceRow(data: CreateInvoiceData): Promise<InvoiceWithLines> {
    try {
      return await this.invoiceRepository.createWithSequentialNumber(data);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ce numéro est déjà utilisé.');
      }
      throw error;
    }
  }

  private async findRawById(companyId: string, id: string): Promise<InvoiceWithLines> {
    const invoice = await this.invoiceRepository.findById(companyId, id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }
}
