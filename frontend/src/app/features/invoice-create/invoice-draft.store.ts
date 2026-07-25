import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyProfile } from '../../core/models/company.model';
import {
  CreateInvoiceLineRequest,
  CreateInvoiceRequest,
  CreateInvoiceServiceLineRequest,
  DocumentType,
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../core/models/invoice.model';
import { ServicePricingMode } from '../../core/models/service.model';
import { isAreaUnit, Unit } from '../../core/models/unit.model';
import { CompanyService } from '../../core/services/company.service';
import { CustomerService } from '../../core/services/customer.service';
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
};

const DRAFT_STORAGE_KEY = 'facturelebat.invoiceDraft.v1';

interface PersistedDraft {
  customer: InvoiceCustomerDraft;
  lines: InvoiceLineDraft[];
  serviceLines: InvoiceServiceLineDraft[];
  documentType: DocumentType;
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
  private readonly productService = inject(ProductService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly company = signal<CompanyProfile | null>(null);
  // Delegate to each service's shared, app-wide cache (see
  // CustomerService.all) rather than holding a local snapshot — a customer/
  // product/service created or edited on any screen becomes selectable here
  // immediately, without needing this store (or the page) to be reloaded.
  readonly customers = computed(() => this.customerService.all() ?? []);
  readonly products = computed(() => this.productService.all() ?? []);
  readonly services = computed(() => this.serviceCatalogService.all() ?? []);

  // Phase 14.3: seeded from the mode-choice slider (via InvoiceCreateShellPage
  // reading the `type` query param), then persisted like every other draft
  // field — a devis is mechanically a facture, this is the only field that
  // says which.
  readonly documentType = signal<DocumentType>('FACTURE');

  readonly customer = signal<InvoiceCustomerDraft>(EMPTY_CUSTOMER);
  // Phase 13.5 gallery redesign: no default blank line — the lines step now
  // starts as an empty gallery, a card only exists once the artisan actually
  // adds one via a fixed "+" button (see InvoiceCreateLinesStepPage).
  readonly lines = signal<InvoiceLineDraft[]>([]);
  readonly serviceLines = signal<InvoiceServiceLineDraft[]>([]);

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

  readonly totalsPreview = computed<TotalsPreview>(() => {
    const company = this.company();
    return computeTotalsPreview(
      this.lineInputs(),
      this.vatApplicable(),
      company?.vatRateBasisPoints ?? 0,
      this.serviceAmountCents(),
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

    effect(() => {
      const snapshot: PersistedDraft = {
        customer: this.customer(),
        lines: this.lines(),
        serviceLines: this.serviceLines(),
        documentType: this.documentType(),
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

  setCustomer(customer: InvoiceCustomerDraft): void {
    this.customer.set(customer);
  }

  setLines(lines: InvoiceLineDraft[]): void {
    this.lines.set(lines);
  }

  setServiceLines(serviceLines: InvoiceServiceLineDraft[]): void {
    this.serviceLines.set(serviceLines);
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

  reset(): void {
    this.customer.set(EMPTY_CUSTOMER);
    this.lines.set([]);
    this.serviceLines.set([]);
    this.documentType.set('FACTURE');
    this.clearStorage();
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
        };
      },
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
    };
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
      if (parsed.documentType === 'DEVIS' || parsed.documentType === 'FACTURE') {
        this.documentType.set(parsed.documentType);
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
