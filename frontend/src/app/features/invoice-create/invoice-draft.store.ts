import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { CompanyProfile } from '../../core/models/company.model';
import { DiscountType } from '../../core/models/discount.model';
import {
  CreateInvoiceDiscountLineRequest,
  CreateInvoiceLineRequest,
  CreateInvoiceRequest,
  CreateInvoiceServiceLineRequest,
  DocumentType,
  InvoiceWithTotals,
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../core/models/invoice.model';
import { ActivityCategory } from '../../core/models/report.model';
import { ServicePricingMode } from '../../core/models/service.model';
import { isAreaUnit, Unit } from '../../core/models/unit.model';
import { CompanyService } from '../../core/services/company.service';
import { CustomerService } from '../../core/services/customer.service';
import { DiscountService } from '../../core/services/discount.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ProductService } from '../../core/services/product.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import {
  computeLineTotalPreviewCents,
  computePercentageServiceAmountCents,
  computeTotalsPreview,
  TotalsPreview,
} from './calculation-preview';

export interface InvoiceCustomerDraft {
  customerId: string | null;
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  saveAsNewCustomer: boolean;
}

export interface InvoiceLineDraft {
  description: string;
  unit: Unit;
  quantity: number;
  unitPriceEuros: number;
  wasteSurcharge: WasteSurcharge;
  // Phase 8.5: how many `unit`s come in one sellable package (e.g. 9 for a
  // 9 m² box) — freehand, optional. roundUpToPackaging defaults to true
  // (automated calculation is the default; the artisan opts out for exact
  // quantity billing) and is inert without a packagingQuantity.
  packagingQuantity: number | null;
  roundUpToPackaging: boolean;
  // Freehand product reference (e.g. "UC204850"), never tied to a saved
  // Product — same soft-snapshot spirit as packagingQuantity above.
  productCode: string | null;
  // Phase 13.5: which catalog Product this line was toggled on from, if any
  // — UI-only (never sent to the backend, see buildInvoiceRequest), lets
  // the merged catalog/lines screen know which toggle to show as "on" and
  // which line to remove when it's toggled back off. Null for a freehand
  // ("+ Ligne libre") line, same as productCode being unset.
  catalogProductId: string | null;
  // UI-only: whether to save this line as a new catalog Product on submit
  // — never sent as-is to the invoice-creation request (see
  // buildInvoiceRequest), mirrors the customer step's saveAsNewCustomer.
  saveAsNewProduct: boolean;
  // Phase 17: snapshotted from the picked catalog Product at the moment
  // this line was added — see CreateInvoiceLineRequest.activityCategory.
  // Not a form field the artisan edits directly, just carried through.
  activityCategory: ActivityCategory | null;
  // Phase 15: per-line PDF rendering toggles, set from the mandatory
  // preview screen — both default true so an artisan who never opens that
  // screen sees no behavior change. Persisted through the same draft
  // localStorage mechanism as every other field here.
  showUnitDetail: boolean;
  showBillingDetail: boolean;
}

export interface InvoiceServiceLineDraft {
  serviceId: string | null;
  name: string;
  description: string;
  // Authoritative for pricingMode FIXED (freely typed/edited). Ignored for
  // PERCENTAGE — see InvoiceDraftStore.resolvedServiceAmountCents, which
  // recomputes that line's real amount live from percentageBasisPoints
  // instead (Phase 13.5: "computed at build time, not typed per invoice").
  amountEuros: number;
  visibility: ServiceLineVisibility;
  redistributionStrategy: RedistributionStrategy;
  weights: number[];
  pricingMode: ServicePricingMode;
  percentageBasisPoints: number | null;
  // Same UI-only toggle-tracking role as InvoiceLineDraft.catalogProductId.
  catalogServiceId: string | null;
  // Same UI-only toggle-tracking role as InvoiceLineDraft.saveAsNewProduct —
  // never sent as-is to the invoice-creation request (see buildInvoiceRequest).
  saveAsNewService: boolean;
  // Phase 17: same soft-snapshot rule as InvoiceLineDraft.activityCategory.
  activityCategory: ActivityCategory | null;
}

// Phase 32: a remise on the draft — mirrors InvoiceServiceLineDraft's shape,
// minus visibility/redistribution (a discount always folds straight into
// the subtotal, never targets specific lines) and minus activityCategory (a
// discount isn't a URSSAF-categorized sale).
export interface InvoiceDiscountLineDraft {
  discountId: string | null;
  name: string;
  discountType: DiscountType;
  // Authoritative for discountType FIXED (freely typed/edited). Ignored for
  // PERCENTAGE — see InvoiceDraftStore.resolvedDiscountAmountCents, which
  // recomputes that line's real amount live instead.
  fixedAmountEuros: number;
  percentageBasisPoints: number | null;
  // Same UI-only toggle-tracking role as InvoiceServiceLineDraft.catalogServiceId.
  catalogDiscountId: string | null;
  // Same UI-only toggle-tracking role as InvoiceServiceLineDraft.saveAsNewService.
  saveAsNewDiscount: boolean;
}

const EMPTY_CUSTOMER: InvoiceCustomerDraft = {
  customerId: null,
  customerName: '',
  customerAddress: '',
  customerEmail: '',
  customerPhone: '',
  saveAsNewCustomer: false,
};

const EMPTY_LINE: InvoiceLineDraft = {
  description: '',
  unit: 'SQUARE_METER',
  quantity: 0,
  unitPriceEuros: 0,
  wasteSurcharge: 'NONE',
  packagingQuantity: null,
  roundUpToPackaging: true,
  productCode: null,
  catalogProductId: null,
  saveAsNewProduct: false,
  showUnitDetail: true,
  showBillingDetail: true,
  activityCategory: null,
};

// Phase 13.5: defaults for fields added after the original InvoiceServiceLineDraft
// shape — merged under a hydrated draft the same way EMPTY_LINE is, so a
// draft persisted before this phase still hydrates to a valid,
// unambiguously-FIXED, non-catalog-linked service line.
const EMPTY_SERVICE_LINE_DEFAULTS = {
  pricingMode: 'FIXED' as ServicePricingMode,
  percentageBasisPoints: null as number | null,
  catalogServiceId: null as string | null,
  saveAsNewService: false,
  activityCategory: null as ActivityCategory | null,
};

// Phase 32: defaults for a discount line draft — same "merge under a
// hydrated draft" role as EMPTY_SERVICE_LINE_DEFAULTS, so a draft persisted
// before this phase (no discountLines at all) still hydrates cleanly.
const EMPTY_DISCOUNT_LINE_DEFAULTS: InvoiceDiscountLineDraft = {
  discountId: null,
  name: '',
  discountType: 'FIXED',
  fixedAmountEuros: 0,
  percentageBasisPoints: null,
  catalogDiscountId: null,
  saveAsNewDiscount: false,
};

const DRAFT_STORAGE_KEY = 'facturele.invoiceDraft.v1';

interface PersistedDraft {
  customer: InvoiceCustomerDraft;
  lines: InvoiceLineDraft[];
  serviceLines: InvoiceServiceLineDraft[];
  discountLines: InvoiceDiscountLineDraft[];
  documentType: DocumentType;
  simplifiedDisplay: boolean;
  sourceDevisId: string | null;
  number: string;
}

// Shared, in-progress state for the whole "nouvelle facture" flow (Phase 6):
// both routed steps (customer, lignes) and the shell (persistent total +
// preview button) read and write the same signals here instead of each
// step owning its own isolated form state. `providedIn: 'root'` keeps a
// single instance alive across step navigation, which is also why company
// profile / saved customers / saved services are loaded once here rather
// than being re-fetched by each step page.
@Injectable({ providedIn: 'root' })
export class InvoiceDraftStore {
  private readonly companyService = inject(CompanyService);
  private readonly customerService = inject(CustomerService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly productService = inject(ProductService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly discountService = inject(DiscountService);
  private readonly destroyRef = inject(DestroyRef);

  readonly company = signal<CompanyProfile | null>(null);
  // Delegate to each service's shared, app-wide cache (see
  // CustomerService.all) rather than holding a local snapshot — a customer/
  // product/service/discount created or edited on any screen becomes
  // selectable here immediately, without needing this store (or the page)
  // to be reloaded.
  readonly customers = computed(() => this.customerService.all() ?? []);
  readonly products = computed(() => this.productService.all() ?? []);
  readonly services = computed(() => this.serviceCatalogService.all() ?? []);
  readonly discounts = computed(() => this.discountService.all() ?? []);
  // The customer-step grid needs to tell "still loading" apart from
  // "loaded, zero customers" (an empty grid is a valid, non-transient state
  // that shouldn't show a skeleton) — `all()` is only ever null before the
  // constructor's getAllCached() call below resolves.
  readonly customersLoaded = computed(() => this.customerService.all() !== null);

  // Phase 14.3: seeded from the mode-choice slider (via InvoiceCreateShellPage
  // reading the `type` query param), then persisted like every other draft
  // field — a devis is mechanically a facture, this is the only field that
  // says which.
  readonly documentType = signal<DocumentType>('FACTURE');

  // "Créer la facture à partir du devis" (see loadFromInvoice below): the id
  // of the devis this draft was seeded from, if any — carried through to
  // buildInvoiceRequest's convertedFromDevisId so the resulting facture
  // stays linked to it, same lineage InvoiceService.convertToFacture's
  // one-shot clone already produces. Null for every ordinary draft.
  readonly sourceDevisId = signal<string | null>(null);

  // Phase 27: the document's number, shown/editable on the apercu step —
  // starts blank and is filled once by ensureNumberSuggestion() with "the
  // highest number this company has ever used for this document type + 1"
  // (see InvoiceService.getNextNumber); the artisan can freely overwrite it
  // from there, e.g. to continue a previous software's sequence. Blank at
  // submit time just means "let the backend pick", same fallback the
  // suggestion itself uses.
  readonly number = signal('');

  readonly customer = signal<InvoiceCustomerDraft>(EMPTY_CUSTOMER);
  // Phase 13.5 gallery redesign: no default blank line — the lines step now
  // starts as an empty gallery, a card only exists once the artisan actually
  // adds one via a fixed "+" button (see InvoiceCreateLinesStepPage).
  readonly lines = signal<InvoiceLineDraft[]>([]);
  readonly serviceLines = signal<InvoiceServiceLineDraft[]>([]);
  readonly discountLines = signal<InvoiceDiscountLineDraft[]>([]);
  // Phase 23: document-level toggle set from the "Personnaliser l'affichage"
  // step — hides the whole Quantité/Prix unitaire columns on the rendered
  // document, leaving only description + line total.
  readonly simplifiedDisplay = signal(false);

  readonly vatApplicable = computed(() => this.company()?.legalStatus === 'COMPANY');

  private readonly lineInputs = computed(() =>
    this.lines().map((line) => ({
      unit: line.unit,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceEuros * 100),
      wasteSurcharge: line.wasteSurcharge,
      packagingQuantity: line.packagingQuantity,
      roundUpToPackaging: line.roundUpToPackaging,
    })),
  );

  private readonly productLinesTotalCents = computed(() =>
    this.lineInputs().reduce((sum, line) => sum + computeLineTotalPreviewCents(line), 0),
  );

  // Phase 13.5: what a PERCENTAGE service line's percentage applies to —
  // "visible product/service lines total" (docs/roadmap.md), taken BEFORE
  // any redistribution folding (avoids a circular dependency: a
  // REDISTRIBUTED line's amount is itself folded into these same product
  // totals) and excluding every OTHER percentage line's own amount (so
  // several percentage lines on the same invoice each compute off the same
  // base rather than compounding on one another — deterministic regardless
  // of how many there are or what order they're in).
  private readonly percentageBaseCents = computed(() => {
    const fixedVisibleServiceCents = this.serviceLines()
      .filter((line) => line.pricingMode === 'FIXED' && line.visibility === 'VISIBLE')
      .reduce((sum, line) => sum + Math.round(line.amountEuros * 100), 0);
    return this.productLinesTotalCents() + fixedVisibleServiceCents;
  });

  // The one place a service line's real amount is read from — FIXED just
  // returns the typed amount; PERCENTAGE recomputes it live from the current
  // base (see percentageBaseCents), never the stale value it happened to
  // have last time this ran. Used for both the running total below and the
  // actual create/preview request (buildInvoiceRequest), so they can never
  // disagree.
  resolvedServiceAmountCents(serviceLine: InvoiceServiceLineDraft): number {
    if (serviceLine.pricingMode === 'FIXED') {
      const cents = Math.round(serviceLine.amountEuros * 100);
      return Number.isFinite(cents) && cents > 0 ? cents : 0;
    }
    return computePercentageServiceAmountCents(
      this.percentageBaseCents(),
      serviceLine.percentageBasisPoints ?? 0,
    );
  }

  private readonly serviceAmountCents = computed(() =>
    this.serviceLines().reduce(
      (sum, serviceLine) => sum + this.resolvedServiceAmountCents(serviceLine),
      0,
    ),
  );

  // Phase 32: same "computed at build time, not typed per invoice" precedent
  // as resolvedServiceAmountCents above — FIXED just returns the typed
  // amount; PERCENTAGE recomputes it live as a share of percentageBaseCents
  // (product lines + FIXED visible service lines, before this discount and
  // before VAT — see the Q&A that settled this base). Used for both the
  // running total below and the actual create/preview request
  // (buildInvoiceRequest), so they can never disagree.
  resolvedDiscountAmountCents(discountLine: InvoiceDiscountLineDraft): number {
    if (discountLine.discountType === 'FIXED') {
      const cents = Math.round(discountLine.fixedAmountEuros * 100);
      return Number.isFinite(cents) && cents > 0 ? cents : 0;
    }
    return computePercentageServiceAmountCents(
      this.percentageBaseCents(),
      discountLine.percentageBasisPoints ?? 0,
    );
  }

  // Public: also read directly by invoice-create-shell.page.html (via
  // app-invoice-totals-summary's discountAmountCents input) to render the
  // "Sous-total avant remise / Remises" breakdown.
  readonly discountAmountCents = computed(() =>
    this.discountLines().reduce(
      (sum, discountLine) => sum + this.resolvedDiscountAmountCents(discountLine),
      0,
    ),
  );

  readonly totalsPreview = computed<TotalsPreview>(() => {
    const company = this.company();
    return computeTotalsPreview(
      this.lineInputs(),
      this.vatApplicable(),
      company?.vatRateBasisPoints ?? 0,
      this.serviceAmountCents(),
      this.discountAmountCents(),
    );
  });

  // Soft UX gate for the shell's "Aperçu" button: mirrors the backend DTO's
  // real requirements (non-empty customer name, at least one usable line)
  // closely enough to avoid an obviously-doomed request, but the backend
  // remains the actual source of truth — a request that slips past this and
  // still fails validation just surfaces as a normal error.
  readonly canPreview = computed(() => {
    const hasCustomerName = this.customer().customerName.trim().length > 0;
    const hasUsableLine = this.lines().some(
      (line) => line.description.trim().length > 0 && line.quantity > 0,
    );
    return hasCustomerName && hasUsableLine;
  });

  constructor() {
    this.hydrateFromStorage();

    // Best-effort loads: a failure here degrades the pickers/preview to
    // free-text-only, same reasoning as the pre-Phase-6 single-page version.
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (profile) => this.company.set(profile) });
    this.customerService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.productService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.serviceCatalogService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.discountService.getAllCached().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    effect(() => {
      const snapshot: PersistedDraft = {
        customer: this.customer(),
        lines: this.lines(),
        serviceLines: this.serviceLines(),
        discountLines: this.discountLines(),
        documentType: this.documentType(),
        simplifiedDisplay: this.simplifiedDisplay(),
        sourceDevisId: this.sourceDevisId(),
        number: this.number(),
      };
      this.writeToStorage(snapshot);
    });
  }

  // Phase 14.3: called once by InvoiceCreateShellPage when the `type` query
  // param is present (a fresh pick from mode-choice) — left untouched
  // otherwise, so resuming an in-progress draft (no query param) never
  // silently flips it back to FACTURE.
  setDocumentType(type: DocumentType): void {
    this.documentType.set(type);
  }

  setNumber(number: string): void {
    this.number.set(number);
  }

  // Phase 27: fetches "highest number ever used for this document type + 1"
  // and fills the field with it — but only if it's still blank (a typed
  // override, a previously-fetched suggestion restored from localStorage,
  // or one already loaded some other way must never be silently
  // overwritten). Best-effort: a failure just leaves the field blank, same
  // as every other best-effort load in this store — the backend falls back
  // to computing its own suggestion if the field is still empty at submit
  // time, so nothing blocks the artisan either way.
  ensureNumberSuggestion(): void {
    if (this.number().trim().length > 0) {
      return;
    }
    this.invoiceService
      .getNextNumber(this.documentType())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ number }) => this.number.set(number),
        error: () => undefined,
      });
  }

  setCustomer(customer: InvoiceCustomerDraft): void {
    this.customer.set(customer);
  }

  setLines(lines: InvoiceLineDraft[]): void {
    this.lines.set(lines);
  }

  setServiceLines(serviceLines: InvoiceServiceLineDraft[]): void {
    this.serviceLines.set(serviceLines);
  }

  setDiscountLines(discountLines: InvoiceDiscountLineDraft[]): void {
    this.discountLines.set(discountLines);
  }

  // Phase 15: flips one line's PDF-detail toggle from the mandatory preview
  // screen. A pure display choice — never touches quantity/price/totals —
  // so it's safe to mutate directly on the store rather than round-tripping
  // through the lines-step FormArray, which is destroyed once the artisan
  // has navigated on to the preview step.
  toggleLineDetail(index: number, field: 'showUnitDetail' | 'showBillingDetail'): void {
    this.lines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, [field]: !line[field] } : line)),
    );
  }

  toggleSimplifiedDisplay(): void {
    this.simplifiedDisplay.update((value) => !value);
  }

  reset(): void {
    this.customer.set(EMPTY_CUSTOMER);
    this.lines.set([]);
    this.serviceLines.set([]);
    this.discountLines.set([]);
    this.documentType.set('FACTURE');
    this.simplifiedDisplay.set(false);
    this.sourceDevisId.set(null);
    this.number.set('');
    this.clearStorage();
  }

  // "Créer la facture à partir du devis" (mes documents / the post-devis
  // "modifier avant facturation" prompt): seeds every signal from an
  // already-persisted devis (entryMode GUIDED only — the caller is
  // responsible for routing a MANUAL devis to ManualInvoiceDraftStore
  // instead) so the artisan can adjust anything before submitting, rather
  // than InvoiceService.convertToFacture's untouched one-shot clone.
  // Overwrites the draft wholesale (not a merge) so no stale field from a
  // previously abandoned draft survives.
  //
  // Service lines lose two things the create-time DTO never returns on a
  // persisted invoice: pricingMode/percentageBasisPoints (a PERCENTAGE line
  // becomes a FIXED one, amount preserved) and the exact original
  // WEIGHTED/EQUAL choice for a REDISTRIBUTED line (rebuilt as WEIGHTED
  // using each line's actual distributed amountCents as its weight — same
  // proportional split, see redistribution.util.expandServiceLineWeights).
  loadFromInvoice(source: InvoiceWithTotals): void {
    this.customer.set({
      customerId: source.customerId,
      customerName: source.customerName,
      customerAddress: source.customerAddress ?? '',
      customerEmail: source.customerEmail ?? '',
      customerPhone: source.customerPhone ?? '',
      saveAsNewCustomer: false,
    });

    this.lines.set(
      source.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantity: Number(line.quantity),
        unitPriceEuros: line.unitPriceCents / 100,
        wasteSurcharge: line.wasteSurcharge,
        packagingQuantity: line.packagingQuantity !== null ? Number(line.packagingQuantity) : null,
        roundUpToPackaging: line.roundUpToPackaging,
        productCode: line.productCode,
        catalogProductId: null,
        saveAsNewProduct: false,
        activityCategory: line.activityCategory,
        showUnitDetail: line.showUnitDetail,
        showBillingDetail: line.showBillingDetail,
      })),
    );

    this.serviceLines.set(
      source.serviceLines.map((serviceLine) => ({
        serviceId: null,
        name: serviceLine.name,
        description: serviceLine.description ?? '',
        amountEuros: serviceLine.amountCents / 100,
        visibility: serviceLine.visibility,
        redistributionStrategy: 'WEIGHTED',
        weights:
          serviceLine.visibility === 'REDISTRIBUTED'
            ? source.lines.map(
                (line) =>
                  serviceLine.distribution?.find((d) => d.invoiceLineId === line.id)?.amountCents ??
                  0,
              )
            : [],
        pricingMode: 'FIXED',
        percentageBasisPoints: null,
        catalogServiceId: null,
        saveAsNewService: false,
        activityCategory: serviceLine.activityCategory,
      })),
    );

    // Phase 32: same "loses its rate, keeps its resolved amount" treatment
    // as a service line above — a persisted invoice never retained whether
    // this remise was originally FIXED or PERCENTAGE (see
    // InvoiceDiscountLine, schema.prisma), so it's rebuilt as a plain FIXED
    // line at the amount it actually resolved to.
    this.discountLines.set(
      source.discountLines.map((discountLine) => ({
        discountId: null,
        name: discountLine.name,
        discountType: 'FIXED',
        fixedAmountEuros: discountLine.amountCents / 100,
        percentageBasisPoints: null,
        catalogDiscountId: null,
        saveAsNewDiscount: false,
      })),
    );

    this.documentType.set('FACTURE');
    this.simplifiedDisplay.set(source.simplifiedDisplay);
    this.sourceDevisId.set(source.id);
    // A converted facture always gets its own fresh number, never the
    // devis's — left blank so ensureNumberSuggestion() computes a real one
    // for FACTURE (the devis's own suggestion, if any was fetched earlier,
    // was for a DEVIS number and would be meaningless here).
    this.number.set('');
  }

  // Builds the exact payload shape the backend expects, for both the real
  // create-submit and the draft preview — the one place this mapping
  // happens, so the two can never diverge (see docs/conventions.md's
  // "no business-logic duplication").
  buildInvoiceRequest(customerId?: string): CreateInvoiceRequest {
    const customer = this.customer();
    const lines: CreateInvoiceLineRequest[] = this.lines().map((line) => ({
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceEuros * 100),
      wasteSurcharge: isAreaUnit(line.unit) ? line.wasteSurcharge : 'NONE',
      packagingQuantity: line.packagingQuantity ?? undefined,
      roundUpToPackaging: line.roundUpToPackaging,
      productCode: line.productCode ?? undefined,
      showUnitDetail: line.showUnitDetail,
      showBillingDetail: line.showBillingDetail,
      activityCategory: line.activityCategory ?? undefined,
    }));

    const serviceLines: CreateInvoiceServiceLineRequest[] = this.serviceLines().map(
      (serviceLine) => {
        const amountCents = this.resolvedServiceAmountCents(serviceLine);
        if (serviceLine.visibility === 'VISIBLE') {
          return {
            serviceId: serviceLine.serviceId ?? undefined,
            name: serviceLine.name,
            description: serviceLine.description || undefined,
            amountCents,
            visibility: 'VISIBLE' as const,
            activityCategory: serviceLine.activityCategory ?? undefined,
          };
        }
        return {
          serviceId: serviceLine.serviceId ?? undefined,
          name: serviceLine.name,
          description: serviceLine.description || undefined,
          amountCents,
          visibility: 'REDISTRIBUTED' as const,
          redistributionStrategy: serviceLine.redistributionStrategy,
          weights:
            serviceLine.redistributionStrategy === 'WEIGHTED' ? serviceLine.weights : undefined,
          activityCategory: serviceLine.activityCategory ?? undefined,
        };
      },
    );

    const discountLines: CreateInvoiceDiscountLineRequest[] = this.discountLines().map(
      (discountLine) => ({
        discountId: discountLine.discountId ?? undefined,
        name: discountLine.name,
        amountCents: this.resolvedDiscountAmountCents(discountLine),
      }),
    );

    return {
      customerName: customer.customerName,
      customerAddress: customer.customerAddress || undefined,
      customerEmail: customer.customerEmail || undefined,
      customerPhone: customer.customerPhone || undefined,
      customerId,
      documentType: this.documentType(),
      lines,
      serviceLines: serviceLines.length > 0 ? serviceLines : undefined,
      discountLines: discountLines.length > 0 ? discountLines : undefined,
      simplifiedDisplay: this.simplifiedDisplay(),
      convertedFromDevisId: this.sourceDevisId() ?? undefined,
      number: this.number().trim() || undefined,
    };
  }

  // Catalog products/services (a line's "Enregistrer dans mon catalogue"
  // toggle) and a freehand customer ("Enregistrer ce client") describe the
  // artisan's environment, not an invoice — they must persist regardless of
  // premium status, only invoice creation/preview itself is gated (see
  // PremiumGateService). Called from the preview step's submit() *and* from
  // its previewData() 402 handler, so an artisan who has used up their free
  // trial still gets what they explicitly asked to save instead of losing it
  // silently behind the paywall. Returns whether anything was actually
  // requested, so a caller can decide whether a confirmation toast is
  // warranted. Product/service catalog CRUD has no premium gate on the
  // backend, consistent with that rule.
  persistFreeEntities(): Observable<boolean> {
    const productSaves = this.lines()
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.saveAsNewProduct)
      .map(({ line, index }) => {
        const payload = {
          name: line.description,
          unit: line.unit,
          priceCents: Math.round(line.unitPriceEuros * 100),
          code: line.productCode || undefined,
          packagingQuantity: line.packagingQuantity ?? undefined,
        };
        const save$ = line.catalogProductId
          ? this.productService.update(line.catalogProductId, payload)
          : this.productService.create(payload);
        return save$.pipe(
          map((product) => ({ index, id: product.id })),
          catchError(() => of(null)),
        );
      });

    const serviceSaves = this.serviceLines()
      .map((serviceLine, index) => ({ serviceLine, index }))
      .filter(({ serviceLine }) => serviceLine.saveAsNewService)
      .map(({ serviceLine, index }) => {
        const payload = {
          name: serviceLine.name,
          description: serviceLine.description || undefined,
          pricingMode: serviceLine.pricingMode,
          priceCents:
            serviceLine.pricingMode === 'FIXED'
              ? Math.round(serviceLine.amountEuros * 100)
              : undefined,
          percentageBasisPoints:
            serviceLine.pricingMode === 'PERCENTAGE'
              ? (serviceLine.percentageBasisPoints ?? undefined)
              : undefined,
          defaultVisibility: serviceLine.visibility,
        };
        const save$ = serviceLine.catalogServiceId
          ? this.serviceCatalogService.update(serviceLine.catalogServiceId, payload)
          : this.serviceCatalogService.create(payload);
        return save$.pipe(
          map((service) => ({ index, id: service.id })),
          catchError(() => of(null)),
        );
      });

    const discountSaves = this.discountLines()
      .map((discountLine, index) => ({ discountLine, index }))
      .filter(({ discountLine }) => discountLine.saveAsNewDiscount)
      .map(({ discountLine, index }) => {
        const payload = {
          name: discountLine.name,
          discountType: discountLine.discountType,
          fixedAmountCents:
            discountLine.discountType === 'FIXED'
              ? Math.round(discountLine.fixedAmountEuros * 100)
              : undefined,
          percentageBasisPoints:
            discountLine.discountType === 'PERCENTAGE'
              ? (discountLine.percentageBasisPoints ?? undefined)
              : undefined,
        };
        const save$ = discountLine.catalogDiscountId
          ? this.discountService.update(discountLine.catalogDiscountId, payload)
          : this.discountService.create(payload);
        return save$.pipe(
          map((discount) => ({ index, id: discount.id })),
          catchError(() => of(null)),
        );
      });

    const customer = this.customer();
    const savingNewCustomer = customer.saveAsNewCustomer && !customer.customerId;
    const customerSave$ = savingNewCustomer
      ? this.customerService
          .create({
            name: customer.customerName,
            address: customer.customerAddress || undefined,
            email: customer.customerEmail || undefined,
            phone: customer.customerPhone || undefined,
          })
          .pipe(
            map((newCustomer) => newCustomer.id),
            catchError(() => of(null)),
          )
      : of(null);

    const hadAnyToSave =
      productSaves.length > 0 ||
      serviceSaves.length > 0 ||
      discountSaves.length > 0 ||
      savingNewCustomer;

    return forkJoin([
      productSaves.length > 0 ? forkJoin(productSaves) : of([]),
      serviceSaves.length > 0 ? forkJoin(serviceSaves) : of([]),
      discountSaves.length > 0 ? forkJoin(discountSaves) : of([]),
      customerSave$,
    ]).pipe(
      map(([productResults, serviceResults, discountResults, customerId]) => {
        if (productResults.length > 0) {
          this.lines.update((currentLines) =>
            currentLines.map((line, index) => {
              const result = productResults.find((r) => r?.index === index);
              return result
                ? { ...line, catalogProductId: result.id, saveAsNewProduct: false }
                : line;
            }),
          );
        }
        if (serviceResults.length > 0) {
          this.serviceLines.update((currentServiceLines) =>
            currentServiceLines.map((serviceLine, index) => {
              const result = serviceResults.find((r) => r?.index === index);
              return result
                ? { ...serviceLine, catalogServiceId: result.id, saveAsNewService: false }
                : serviceLine;
            }),
          );
        }
        if (discountResults.length > 0) {
          this.discountLines.update((currentDiscountLines) =>
            currentDiscountLines.map((discountLine, index) => {
              const result = discountResults.find((r) => r?.index === index);
              return result
                ? { ...discountLine, catalogDiscountId: result.id, saveAsNewDiscount: false }
                : discountLine;
            }),
          );
        }
        if (customerId) {
          this.customer.update((current) => ({ ...current, customerId, saveAsNewCustomer: false }));
        }
        return hadAnyToSave;
      }),
    );
  }

  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
      if (parsed.customer) {
        this.customer.set({ ...EMPTY_CUSTOMER, ...parsed.customer });
      }
      if (Array.isArray(parsed.lines) && parsed.lines.length > 0) {
        // Merge over EMPTY_LINE so a draft persisted before Phase 8.5 (missing
        // packagingQuantity/roundUpToPackaging) still hydrates to valid values.
        this.lines.set(parsed.lines.map((line) => ({ ...EMPTY_LINE, ...line })));
      }
      if (Array.isArray(parsed.serviceLines)) {
        this.serviceLines.set(
          parsed.serviceLines.map((serviceLine) => ({
            ...EMPTY_SERVICE_LINE_DEFAULTS,
            ...serviceLine,
          })),
        );
      }
      if (Array.isArray(parsed.discountLines)) {
        this.discountLines.set(
          parsed.discountLines.map((discountLine) => ({
            ...EMPTY_DISCOUNT_LINE_DEFAULTS,
            ...discountLine,
          })),
        );
      }
      if (parsed.documentType === 'DEVIS' || parsed.documentType === 'FACTURE') {
        this.documentType.set(parsed.documentType);
      }
      if (typeof parsed.simplifiedDisplay === 'boolean') {
        this.simplifiedDisplay.set(parsed.simplifiedDisplay);
      }
      if (typeof parsed.sourceDevisId === 'string') {
        this.sourceDevisId.set(parsed.sourceDevisId);
      }
      if (typeof parsed.number === 'string') {
        this.number.set(parsed.number);
      }
    } catch {
      // Malformed/unavailable storage — start from a blank draft rather
      // than blocking the page. Whatever was there never reaches the
      // backend without going through validation again anyway.
    }
  }

  private writeToStorage(snapshot: PersistedDraft): void {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the draft simply
      // won't survive a refresh; the in-memory flow still works.
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Nothing to do if storage isn't available in the first place.
    }
  }
}
