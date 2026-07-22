import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyProfile } from '../../core/models/company.model';
import { CustomerProfile } from '../../core/models/customer.model';
import {
  CreateInvoiceLineRequest,
  CreateInvoiceRequest,
  CreateInvoiceServiceLineRequest,
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../core/models/invoice.model';
import { ServiceProfile } from '../../core/models/service.model';
import { isAreaUnit, Unit } from '../../core/models/unit.model';
import { CompanyService } from '../../core/services/company.service';
import { CustomerService } from '../../core/services/customer.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { computeTotalsPreview, TotalsPreview } from './calculation-preview';

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
}

export interface InvoiceServiceLineDraft {
  serviceId: string | null;
  name: string;
  description: string;
  amountEuros: number;
  visibility: ServiceLineVisibility;
  redistributionStrategy: RedistributionStrategy;
  weights: number[];
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
};

const DRAFT_STORAGE_KEY = 'facturelebat.invoiceDraft.v1';

interface PersistedDraft {
  customer: InvoiceCustomerDraft;
  lines: InvoiceLineDraft[];
  serviceLines: InvoiceServiceLineDraft[];
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
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly company = signal<CompanyProfile | null>(null);
  readonly customers = signal<CustomerProfile[]>([]);
  readonly services = signal<ServiceProfile[]>([]);

  readonly customer = signal<InvoiceCustomerDraft>(EMPTY_CUSTOMER);
  readonly lines = signal<InvoiceLineDraft[]>([{ ...EMPTY_LINE }]);
  readonly serviceLines = signal<InvoiceServiceLineDraft[]>([]);

  readonly vatApplicable = computed(() => this.company()?.legalStatus === 'COMPANY');

  private readonly serviceAmountCents = computed(() =>
    this.serviceLines().reduce((sum, serviceLine) => {
      const cents = Math.round(serviceLine.amountEuros * 100);
      return Number.isFinite(cents) && cents > 0 ? sum + cents : sum;
    }, 0),
  );

  readonly totalsPreview = computed<TotalsPreview>(() => {
    const company = this.company();
    const lineInputs = this.lines().map((line) => ({
      unit: line.unit,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceEuros * 100),
      wasteSurcharge: line.wasteSurcharge,
      packagingQuantity: line.packagingQuantity,
      roundUpToPackaging: line.roundUpToPackaging,
    }));
    return computeTotalsPreview(
      lineInputs,
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
    this.customerService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (customers) => this.customers.set(customers) });
    this.serviceCatalogService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (services) => this.services.set(services) });

    effect(() => {
      const snapshot: PersistedDraft = {
        customer: this.customer(),
        lines: this.lines(),
        serviceLines: this.serviceLines(),
      };
      this.writeToStorage(snapshot);
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

  reset(): void {
    this.customer.set(EMPTY_CUSTOMER);
    this.lines.set([{ ...EMPTY_LINE }]);
    this.serviceLines.set([]);
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
    }));

    const serviceLines: CreateInvoiceServiceLineRequest[] = this.serviceLines().map(
      (serviceLine) => {
        if (serviceLine.visibility === 'VISIBLE') {
          return {
            serviceId: serviceLine.serviceId ?? undefined,
            name: serviceLine.name,
            description: serviceLine.description || undefined,
            amountCents: Math.round(serviceLine.amountEuros * 100),
            visibility: 'VISIBLE' as const,
          };
        }
        return {
          serviceId: serviceLine.serviceId ?? undefined,
          name: serviceLine.name,
          description: serviceLine.description || undefined,
          amountCents: Math.round(serviceLine.amountEuros * 100),
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
        this.serviceLines.set(parsed.serviceLines);
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
