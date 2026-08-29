import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  DocumentType,
  InvoiceEntryMode,
  InvoiceStatus,
  NatureOperation,
  SignatureMethod,
  SimplifiedDisplayLevel,
} from '../../generated/prisma/enums';
import { PlanGateService } from '../billing/plan-gate.service';
import { CompanyService } from '../company/company.service';
import { isVatApplicable } from '../company/legal-status.util';
import { CustomerService } from '../customer/customer.service';
import { DiscountService } from '../discount/discount.service';
import { ProductService } from '../product/product.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { CompanySuperPdpService } from './e-invoicing/company-super-pdp.service';
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
    private readonly productService: ProductService,
    private readonly mapper: InvoiceMapper,
    private readonly premiumGate: PlanGateService,
    private readonly companySuperPdp: CompanySuperPdpService,
  ) {}

  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): 20 minutes —
  // long enough for an artisan to notice and cancel a mistake right after
  // creating a FACTURE, short enough that "automatic" still feels automatic.
  // Not yet a per-company setting (see docs/1.3/1.3-3's own non-goals) —
  // one fixed value for everyone who opts in.
  private static readonly AUTO_TRANSMIT_GRACE_PERIOD_MS = 20 * 60 * 1000;

  // Only a FACTURE, only when the company opted in, and only once SUPER PDP
  // is actually connected — checked fresh here rather than trusted from a
  // stale `company` read, since auto-transmit scheduling a FACTURE nobody
  // can actually send yet would be silently pointless.
  private async computeScheduledTransmitAt(
    companyId: string,
    documentType: DocumentType,
    autoTransmitViaPa: boolean,
  ): Promise<Date | undefined> {
    if (documentType !== DocumentType.FACTURE || !autoTransmitViaPa) {
      return undefined;
    }
    const connected = await this.companySuperPdp.isConnected(companyId);
    if (!connected) {
      return undefined;
    }
    return new Date(Date.now() + InvoiceService.AUTO_TRANSMIT_GRACE_PERIOD_MS);
  }

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
    const lineDtos = entryMode === InvoiceEntryMode.GUIDED ? (dto.lines ?? []) : [];
    // Same soft-reference existence check as serviceId/discountId below, for
    // a line's productId — there is no DELETE /products endpoint either.
    for (const line of lineDtos) {
      if (line.productId) {
        await this.productService.findById(companyId, line.productId);
      }
    }

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

    const documentType = dto.documentType ?? DocumentType.FACTURE;
    const scheduledTransmitAt = await this.computeScheduledTransmitAt(
      companyId,
      documentType,
      company.autoTransmitViaPa,
    );

    const invoice = await this.createInvoiceRow({
      companyId: company.id,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      customerSiret: dto.customerSiret,
      deliveryAddress: dto.deliveryAddress,
      customerId: dto.customerId,
      customerFields: (dto.customerFields ?? []).map((field) => ({
        label: field.label,
        value: field.value,
      })),
      // ManualModeFieldsConsistency guarantees these two overrides are only
      // ever present for entryMode MANUAL, so this can't misfire for a
      // GUIDED invoice. reverseChargeApplicable (Phase 1.1-7), unlike
      // vatApplicableOverride, is allowed in both modes and always wins when
      // set — autoliquidation is a VAT-correctness fact about the job, not a
      // stylistic choice the artisan's own manual VAT pick should be able to
      // override.
      vatApplicable: dto.reverseChargeApplicable
        ? false
        : (dto.vatApplicableOverride ?? isVatApplicable(company.legalStatus)),
      vatRateBasisPoints: dto.vatRateBasisPointsOverride ?? company.vatRateBasisPoints,
      subtotalOverrideCents: dto.subtotalOverrideCents,
      vatOverrideCents: dto.vatOverrideCents,
      totalOverrideCents: dto.totalOverrideCents,
      entryMode,
      documentType,
      scheduledTransmitAt,
      convertedFromDevisId: dto.convertedFromDevisId,
      // Phase 27: absent means "use the auto-suggested next number" — see
      // createInvoiceRow/computeNextDocumentNumber.
      number: dto.number,
      simplifiedDisplay: dto.simplifiedDisplay ?? SimplifiedDisplayLevel.NONE,
      // Phase 1.1-3: DepositFieldsConsistency already guarantees these are
      // both present or both absent, and only ever present for a FACTURE.
      depositPercentageBasisPoints: dto.depositPercentageBasisPoints,
      depositAmountCents: dto.depositAmountCents,
      // ReverseChargeFactureOnly guarantees this is never true for a DEVIS.
      reverseChargeApplicable: dto.reverseChargeApplicable ?? false,
      // ManualModeFieldsConsistency guarantees this is only ever present for
      // entryMode MANUAL; GUIDED derives its own "nature de l'opération"
      // instead (see InvoiceMapper), so this stays undefined there —
      // undefined leaves the column NULL, never a meaningless default.
      manualNatureOfOperation:
        entryMode === InvoiceEntryMode.MANUAL
          ? (dto.manualNatureOfOperation ?? NatureOperation.PRESTATION_SERVICES)
          : undefined,
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
              productId: line.productId,
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
        targetLineIndex: discountLine.targetLineIndex,
        targetServiceLineIndex: discountLine.targetServiceLineIndex,
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

    // Phase 1.3-3: a devis converting into a facture is just as much a "new
    // FACTURE" as one created from scratch via create() above — same
    // eligibility check, same grace period.
    const company = await this.companyService.getProfile(companyId);
    const scheduledTransmitAt = await this.computeScheduledTransmitAt(
      companyId,
      DocumentType.FACTURE,
      company.autoTransmitViaPa,
    );

    const invoice = await this.createInvoiceRow({
      companyId,
      scheduledTransmitAt,
      customerName: devis.customerName,
      customerAddress: devis.customerAddress ?? undefined,
      customerEmail: devis.customerEmail ?? undefined,
      customerPhone: devis.customerPhone ?? undefined,
      customerSiret: devis.customerSiret ?? undefined,
      deliveryAddress: devis.deliveryAddress ?? undefined,
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
      // Phase 1.1-8: carried through, same "untouched one-shot clone"
      // reasoning as every other field here — a MANUAL devis's own choice
      // (if any) should survive the conversion, not silently reset to the
      // default.
      manualNatureOfOperation: devis.manualNatureOfOperation ?? undefined,
      lines: devis.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity.toNumber(),
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity?.toNumber(),
        roundUpToPackaging: line.roundUpToPackaging,
        productCode: line.productCode ?? undefined,
        productId: line.productId ?? undefined,
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
      discountLines: devis.discountLines.map((discountLine): CreateInvoiceDiscountLineData => {
        const targetLineIndex = discountLine.targetInvoiceLineId
          ? devis.lines.findIndex((line) => line.id === discountLine.targetInvoiceLineId)
          : -1;
        const targetServiceLineIndex = discountLine.targetInvoiceServiceLineId
          ? devis.serviceLines.findIndex(
              (serviceLine) => serviceLine.id === discountLine.targetInvoiceServiceLineId,
            )
          : -1;
        return {
          discountId: discountLine.discountId ?? undefined,
          name: discountLine.name,
          amountCents: discountLine.amountCents,
          targetLineIndex: targetLineIndex >= 0 ? targetLineIndex : undefined,
          targetServiceLineIndex: targetServiceLineIndex >= 0 ? targetServiceLineIndex : undefined,
        };
      }),
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

  // Retroactive devis creation: an artisan who forgot to make the devis
  // before issuing a facture can create one after the fact — an untouched
  // clone of the facture, like convertToFacture above but in the opposite
  // direction, with an artisan-chosen number (see ConvertToDevisDto) since
  // there's no natural "next devis in sequence" to default to here. Kept as
  // its own method rather than a documentType param on convertToFacture:
  // the guard clauses, lineage field, and "already has one" check are all
  // mirrored-but-reversed, not shared logic.
  async convertToDevis(
    companyId: string,
    factureId: string,
    number: string,
  ): Promise<InvoiceWithTotals> {
    await this.premiumGate.assertCanCreateInvoice(companyId);

    const facture = await this.findRawById(companyId, factureId);
    if (facture.documentType !== DocumentType.FACTURE) {
      throw new BadRequestException(`Invoice ${factureId} is not a facture`);
    }
    if (facture.retroactiveDevis) {
      throw new BadRequestException(`Facture ${factureId} already has a devis created from it`);
    }

    const invoice = await this.createInvoiceRow({
      companyId,
      customerName: facture.customerName,
      customerAddress: facture.customerAddress ?? undefined,
      customerEmail: facture.customerEmail ?? undefined,
      customerPhone: facture.customerPhone ?? undefined,
      customerSiret: facture.customerSiret ?? undefined,
      deliveryAddress: facture.deliveryAddress ?? undefined,
      customerId: facture.customerId ?? undefined,
      customerFields: facture.customerFields.map((field) => ({
        label: field.label,
        value: field.value,
      })),
      vatApplicable: facture.vatApplicable,
      vatRateBasisPoints: facture.vatRateBasisPoints,
      subtotalOverrideCents: facture.subtotalOverrideCents ?? undefined,
      vatOverrideCents: facture.vatOverrideCents ?? undefined,
      totalOverrideCents: facture.totalOverrideCents ?? undefined,
      entryMode: facture.entryMode,
      documentType: DocumentType.DEVIS,
      createdFromFactureId: facture.id,
      number,
      simplifiedDisplay: facture.simplifiedDisplay,
      // Phase 1.1-8: same carry-through reasoning as convertToFacture above.
      manualNatureOfOperation: facture.manualNatureOfOperation ?? undefined,
      lines: facture.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity.toNumber(),
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity?.toNumber(),
        roundUpToPackaging: line.roundUpToPackaging,
        productCode: line.productCode ?? undefined,
        productId: line.productId ?? undefined,
        showUnitDetail: line.showUnitDetail,
        showBillingDetail: line.showBillingDetail,
        activityCategory: line.activityCategory ?? undefined,
      })),
      serviceLines: facture.serviceLines.map((serviceLine): CreateInvoiceServiceLineData => ({
        serviceId: serviceLine.serviceId ?? undefined,
        name: serviceLine.name,
        description: serviceLine.description ?? undefined,
        amountCents: serviceLine.amountCents,
        visibility: serviceLine.visibility,
        activityCategory: serviceLine.activityCategory ?? undefined,
        weights:
          serviceLine.visibility === 'REDISTRIBUTED'
            ? facture.lines.map(
                (line) =>
                  serviceLine.weights.find((weight) => weight.invoiceLineId === line.id)?.weight ??
                  0,
              )
            : undefined,
      })),
      discountLines: facture.discountLines.map((discountLine): CreateInvoiceDiscountLineData => {
        const targetLineIndex = discountLine.targetInvoiceLineId
          ? facture.lines.findIndex((line) => line.id === discountLine.targetInvoiceLineId)
          : -1;
        const targetServiceLineIndex = discountLine.targetInvoiceServiceLineId
          ? facture.serviceLines.findIndex(
              (serviceLine) => serviceLine.id === discountLine.targetInvoiceServiceLineId,
            )
          : -1;
        return {
          discountId: discountLine.discountId ?? undefined,
          name: discountLine.name,
          amountCents: discountLine.amountCents,
          targetLineIndex: targetLineIndex >= 0 ? targetLineIndex : undefined,
          targetServiceLineIndex: targetServiceLineIndex >= 0 ? targetServiceLineIndex : undefined,
        };
      }),
      manualColumns:
        facture.entryMode === InvoiceEntryMode.MANUAL
          ? facture.manualColumns.map((column) => ({
              role: column.role,
              label: column.label,
              widthPx: column.widthPx ?? undefined,
            }))
          : undefined,
      manualRows:
        facture.entryMode === InvoiceEntryMode.MANUAL
          ? facture.manualRows.map((row) => ({
              heightPx: row.heightPx ?? undefined,
              cells: facture.manualColumns.map(
                (column) => row.cells.find((cell) => cell.columnId === column.id)?.value ?? '',
              ),
            }))
          : undefined,
    });

    // Phase 33: same reasoning as convertToFacture's identical call above —
    // a company able to reach this point already has invoiceCount >= 1 from
    // the source facture alone.
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
    // Phase 1.1-3: ACOMPTE_VERSE only makes sense on a facture that actually
    // has a deposit requested — see schema.prisma's comment on
    // InvoiceStatus.
    if (dto.status === InvoiceStatus.ACOMPTE_VERSE && invoice.depositAmountCents === null) {
      throw new BadRequestException(`Invoice ${id} has no deposit requested`);
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
    // Same "records the fact, not a log" convention, for ACOMPTE_VERSE.
    const depositPaidAt =
      dto.status === InvoiceStatus.ACOMPTE_VERSE
        ? (invoice.depositPaidAt ?? new Date())
        : dto.status !== invoice.status
          ? null
          : invoice.depositPaidAt;

    const updated = await this.invoiceRepository.updateStatus(companyId, id, {
      status: dto.status,
      // dto.dueDate omitted means "leave it exactly as it is" (e.g. an
      // artisan re-dragging a card that already has a due date) — never
      // silently cleared by an update that isn't about the due date at all.
      dueDate: dto.dueDate !== undefined ? new Date(dto.dueDate) : undefined,
      paidAt,
      depositPaidAt,
    });

    return this.mapper.toInvoiceWithTotals(updated);
  }

  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): the
  // artisan's own "Annuler" on a still-pending auto-transmission. See
  // InvoiceRepository.cancelScheduledTransmit's own comment for why this
  // never throws for an "already sent"/"already cancelled" invoice — only a
  // genuinely missing/foreign id is a real error here, checked up front via
  // findRawById same as updateStatus above (not the catch-NoRowsAffectedError
  // pattern other modules use — this file's own established convention).
  async cancelAutoTransmit(companyId: string, id: string): Promise<InvoiceWithTotals> {
    await this.findRawById(companyId, id);
    const updated = await this.invoiceRepository.cancelScheduledTransmit(companyId, id);
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
    const [invoice, logo, signature] = await Promise.all([
      this.findRawById(companyId, id),
      this.companyService.getLogo(companyId),
      this.invoiceRepository.findSignatureImage(companyId, id),
    ]);
    return this.mapper.toPdfData(invoice, logo, signature);
  }

  // Phase 1.3-7 ("Partager"): findRawById first, same "existence/scope
  // check before the repository write" convention as cancelAutoTransmit
  // above — not the catch-NoRowsAffectedError pattern other modules use.
  async getOrCreateShareLink(companyId: string, id: string): Promise<string> {
    await this.findRawById(companyId, id);
    return this.invoiceRepository.getOrCreateShareToken(companyId, id);
  }

  async revokeShareLink(companyId: string, id: string): Promise<void> {
    await this.findRawById(companyId, id);
    await this.invoiceRepository.revokeShareToken(companyId, id);
  }

  // No companyId to scope by here — the token itself is what authorizes
  // this call, reached from InvoiceController's @Public() route. A missing/
  // revoked token reads as a plain 404, same "never leak more than that"
  // posture as findRawById's own cross-tenant comment.
  async getPdfDataByShareToken(token: string): Promise<InvoicePdfData> {
    const invoice = await this.invoiceRepository.findByShareToken(token);
    if (!invoice) {
      throw new NotFoundException('Lien de partage introuvable.');
    }
    const [logo, signature] = await Promise.all([
      this.companyService.getLogo(invoice.companyId),
      this.invoiceRepository.findSignatureImage(invoice.companyId, invoice.id),
    ]);
    return this.mapper.toPdfData(invoice, logo, signature);
  }

  // Phase 1.1-1: "Signer" — attaches a drawn or photographed signature,
  // replacing any existing one for this document. See
  // InvoiceController.uploadSignature for the upload/validation boundary.
  async uploadSignature(
    companyId: string,
    id: string,
    data: { image: Buffer; mimeType: string; method: SignatureMethod },
  ): Promise<InvoiceWithTotals> {
    await this.findRawById(companyId, id);
    const invoice = await this.invoiceRepository.upsertSignature(id, data);
    return this.mapper.toInvoiceWithTotals(invoice);
  }

  // Reverts the document to its manual/unchecked state — see
  // schema.prisma's comment on Invoice.manuallySigned.
  async deleteSignature(companyId: string, id: string): Promise<InvoiceWithTotals> {
    await this.findRawById(companyId, id);
    const invoice = await this.invoiceRepository.deleteSignature(id);
    return this.mapper.toInvoiceWithTotals(invoice);
  }

  async getSignatureImage(
    companyId: string,
    id: string,
  ): Promise<{ image: Buffer; mimeType: string } | null> {
    await this.findRawById(companyId, id);
    return this.invoiceRepository.findSignatureImage(companyId, id);
  }

  // The freehand fallback checkbox — only interactive while no real
  // InvoiceSignature is attached (see schema.prisma's comment on
  // Invoice.manuallySigned); enforced here, not just disabled client-side.
  async setManuallySigned(
    companyId: string,
    id: string,
    manuallySigned: boolean,
  ): Promise<InvoiceWithTotals> {
    const invoice = await this.findRawById(companyId, id);
    if (invoice.signature) {
      throw new BadRequestException(
        'Une signature est déjà attachée à ce document — supprimez-la avant de modifier cette case.',
      );
    }
    const updated = await this.invoiceRepository.updateManuallySigned(
      companyId,
      id,
      manuallySigned,
    );
    return this.mapper.toInvoiceWithTotals(updated);
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

    const [company, logo, customer] = await Promise.all([
      this.companyService.getProfile(companyId),
      this.companyService.getLogo(companyId),
      // Phase 1.1-7: same lenient (never-throws) lookup as the rest of this
      // method's own "stale id can't corrupt anything" reasoning — a
      // customerId that no longer resolves just previews as "not
      // professional" rather than failing the whole preview.
      dto.customerId ? this.customerService.findByIdOrNull(companyId, dto.customerId) : null,
    ]);
    return this.mapper.toPreviewPdfData(dto, company, logo, customer?.isProfessional ?? false);
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
