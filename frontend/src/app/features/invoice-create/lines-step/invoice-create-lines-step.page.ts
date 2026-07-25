import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../../core/models/invoice.model';
import { ProductProfile } from '../../../core/models/product.model';
import { ServicePricingMode, ServiceProfile } from '../../../core/models/service.model';
import { Unit } from '../../../core/models/unit.model';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { computeLineTotalPreviewCents } from '../calculation-preview';
import {
  InvoiceLineFormComponent,
  InvoiceLineFormGroup,
} from '../components/invoice-line-form.component';
import {
  InvoiceServiceLineFormComponent,
  InvoiceServiceLineFormGroup,
} from '../components/invoice-service-line-form.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 6/13.5 gallery redesign, step 2: two fixed "+" buttons (product,
// service) replace the old always-visible catalog toggle grid and the
// "+ Ligne libre"/"+ Prestation libre" buttons below a running list of big
// forms. Clicking a button opens a small flyout — catalog pick, quick
// create, or a one-off free line — that pushes into the same FormArrays as
// before; every active line/service-line renders as a card that starts
// expanded (the full form, unchanged) and collapses into a compact gallery
// card once "Valider" confirms it, or back out again on click to edit.
// Still seeded from, and continuously synced back into, the shared
// InvoiceDraftStore so the shell's total and preview button reflect this
// step's edits immediately.
@Component({
  selector: 'app-invoice-create-lines-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    BigButtonComponent,
    CentsToEurosPipe,
    UnitLabelPipe,
    InvoiceLineFormComponent,
    InvoiceServiceLineFormComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-lines-step.page.html',
})
export class InvoiceCreateLinesStepPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly errorMessage = signal<string | null>(null);
  // Phase 13.5 gallery redesign: which of the two fixed "+" flyouts is open
  // — mutually exclusive, opening one closes the other.
  protected readonly productPanelOpen = signal(false);
  protected readonly servicePanelOpen = signal(false);

  protected readonly lines = this.fb.array<InvoiceLineFormGroup>(
    this.draftStore.lines().map((line) => this.createLineGroup(line)),
  );

  private readonly linesValue = toSignal(this.lines.valueChanges, {
    initialValue: this.lines.getRawValue(),
  });

  protected readonly serviceLines = this.fb.array<InvoiceServiceLineFormGroup>(
    this.draftStore.serviceLines().map((serviceLine) => this.createServiceLineGroup(serviceLine)),
  );

  private readonly serviceLinesValue = toSignal(this.serviceLines.valueChanges, {
    initialValue: this.serviceLines.getRawValue(),
  });

  // Phase 13.5 gallery redesign: cards collapsed into their compact gallery
  // form. A group only ever enters this set via collapseLine/collapseService
  // Line ("Valider") — a freshly added line/service-line (catalog pick,
  // quick-create, or free) always starts expanded so the artisan sees the
  // fields they just triggered, never a card they didn't ask to fill.
  // Restored draft lines (navigating back to this step) are the one
  // exception, seeded collapsed below when they already hold valid data.
  protected readonly collapsedLines = signal<ReadonlySet<InvoiceLineFormGroup>>(
    new Set(this.lines.controls.filter((group) => group.valid)),
  );
  protected readonly collapsedServiceLines = signal<ReadonlySet<InvoiceServiceLineFormGroup>>(
    new Set(this.serviceLines.controls.filter((group) => group.valid)),
  );

  protected readonly lineLabels = computed(() =>
    this.linesValue().map((line, index) => line.description || `Ligne ${index + 1}`),
  );

  // Phase 13.5: which catalog Product/Service currently has an active line,
  // and at which index — this is what lets the flyout's catalog list render
  // an "activé" state and know which line to remove on a second click,
  // without a separate hand-maintained id→index map that could drift out of
  // sync with the FormArrays themselves (see catalogProductId/catalogServiceId).
  protected readonly activeProductLineIndex = computed(() => {
    const map = new Map<string, number>();
    this.linesValue().forEach((line, index) => {
      if (line.catalogProductId) {
        map.set(line.catalogProductId, index);
      }
    });
    return map;
  });

  protected readonly activeServiceLineIndex = computed(() => {
    const map = new Map<string, number>();
    this.serviceLinesValue().forEach((serviceLine, index) => {
      if (serviceLine.catalogServiceId) {
        map.set(serviceLine.catalogServiceId, index);
      }
    });
    return map;
  });

  // Live amount for every current service line, in the same order as
  // serviceLines.controls — reads through InvoiceDraftStore so a
  // PERCENTAGE line's amount always reflects the current base (see
  // InvoiceDraftStore.resolvedServiceAmountCents), not whatever it was
  // computed to at the moment it was toggled on.
  protected readonly serviceLineAmountsCents = computed(() =>
    this.draftStore
      .serviceLines()
      .map((serviceLine) => this.draftStore.resolvedServiceAmountCents(serviceLine)),
  );

  // Live per-line total for the gallery's compact card and expanded-form
  // recap — same preview-only mirror as InvoiceDraftStore.totalsPreview,
  // just broken out per line instead of summed.
  protected readonly lineTotalsCents = computed(() =>
    // FormArray.valueChanges types every field as possibly-undefined
    // (Angular's typed-forms convention — see getRawValue() vs value) even
    // though these nonNullable controls are never actually undefined at
    // runtime; the `??` fallbacks below only satisfy that static typing.
    this.linesValue().map((line) =>
      computeLineTotalPreviewCents({
        unit: line.unit ?? 'SQUARE_METER',
        quantity: line.quantity ?? 0,
        unitPriceCents: Math.round((line.unitPriceEuros ?? 0) * 100),
        wasteSurcharge: line.wasteSurcharge ?? 'NONE',
        packagingQuantity: line.packagingQuantity,
        roundUpToPackaging: line.roundUpToPackaging,
      }),
    ),
  );

  constructor() {
    this.lines.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.draftStore.setLines(this.lines.getRawValue());
    });
    this.serviceLines.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.draftStore.setServiceLines(this.serviceLines.getRawValue());
    });
  }

  private createLineGroup(initial?: {
    description: string;
    unit: Unit;
    quantity: number;
    unitPriceEuros: number;
    wasteSurcharge: WasteSurcharge;
    packagingQuantity: number | null;
    roundUpToPackaging: boolean;
    productCode: string | null;
    catalogProductId?: string | null;
    showUnitDetail?: boolean;
    showBillingDetail?: boolean;
  }): InvoiceLineFormGroup {
    return this.fb.nonNullable.group({
      description: this.fb.nonNullable.control(initial?.description ?? '', Validators.required),
      unit: this.fb.nonNullable.control<Unit>(initial?.unit ?? 'SQUARE_METER', Validators.required),
      quantity: this.fb.nonNullable.control(initial?.quantity ?? 0, [
        Validators.required,
        Validators.min(0.001),
      ]),
      unitPriceEuros: this.fb.nonNullable.control(initial?.unitPriceEuros ?? 0, [
        Validators.required,
        Validators.min(0),
      ]),
      wasteSurcharge: this.fb.nonNullable.control<WasteSurcharge>(
        initial?.wasteSurcharge ?? 'NONE',
      ),
      // Phase 8.5: freehand packaging info for this line — see
      // InvoiceLineFormComponent for the "arrondir au conditionnement" toggle.
      packagingQuantity: this.fb.control<number | null>(initial?.packagingQuantity ?? null, [
        Validators.min(0.001),
      ]),
      roundUpToPackaging: this.fb.nonNullable.control(initial?.roundUpToPackaging ?? true),
      // Freehand product reference (e.g. "UC204850"), same soft-snapshot
      // spirit as packagingQuantity above.
      productCode: this.fb.control<string | null>(initial?.productCode ?? null),
      // UI-only: whether to save this line as a new catalog Product on
      // submit — never sent as-is to the invoice-creation request (see
      // submit() below), mirrors the customer step's saveAsNewCustomer.
      saveAsNewProduct: this.fb.nonNullable.control(false),
      // Phase 13.5, UI-only: see InvoiceLineDraft.catalogProductId.
      catalogProductId: this.fb.control<string | null>(initial?.catalogProductId ?? null),
      // Phase 15: not rendered by this step's own template — set from the
      // preview step (see InvoiceDraftStore.toggleLineDetail) and carried
      // through here only so this step's own valueChanges->setLines() sync
      // (see the constructor) never clobbers it back to the default.
      showUnitDetail: this.fb.nonNullable.control(initial?.showUnitDetail ?? true),
      showBillingDetail: this.fb.nonNullable.control(initial?.showBillingDetail ?? true),
    });
  }

  // Phase 13.5 gallery redesign: the "+ Ligne ponctuelle" flyout entry — a
  // blank card, not tied to any catalog Product, same as today's
  // "Enregistrer ce produit" checkbox inside the expanded form for an
  // artisan who wants a one-off charge without polluting their catalog.
  protected addFreeLine(): void {
    this.lines.push(this.createLineGroup());
    this.syncAllServiceLineWeights();
    this.productPanelOpen.set(false);
  }

  // Phase 11/13.5: catalog-driven invoicing. Toggling on a catalog Product
  // prefills everything the invoice line needs except quantity (the one
  // field the artisan still normally types) — same "autofill, not a lock"
  // rule as every other soft catalog reference in this app: the pushed line
  // stays fully editable afterwards. `quantity` is left at 0 (invalid)
  // rather than defaulted to 1, so an artisan can never submit a catalog
  // line without having actually looked at the quantity field.
  //
  // Everything else about this line is already known — so unlike a free
  // line, it goes straight into the compact gallery card instead of opening
  // the full form (see the quantity mini-input on that card). quantity is
  // marked touched right away so the global invalid-field highlight (see
  // styles.css) turns that mini-input red immediately, rather than waiting
  // for a blur/submit the artisan has no other reason to trigger here.
  private addProductFromCatalog(product: ProductProfile): void {
    const group = this.createLineGroup({
      description: product.name,
      unit: product.unit,
      quantity: 0,
      unitPriceEuros: product.priceCents / 100,
      wasteSurcharge: 'NONE',
      packagingQuantity: product.packagingQuantity ? Number(product.packagingQuantity) : null,
      roundUpToPackaging: true,
      productCode: product.code,
      catalogProductId: product.id,
    });
    this.lines.push(group);
    this.syncAllServiceLineWeights();
    group.controls.quantity.markAsTouched();
    this.collapsedLines.update((set) => new Set(set).add(group));
  }

  protected removeLine(index: number): void {
    const group = this.lines.at(index);
    this.lines.removeAt(index);
    this.syncAllServiceLineWeights();
    this.uncollapseLine(group);
  }

  // Phase 13.5: the catalog flyout's single entry point for a Product row —
  // flips it on (adds a line) or off (removes its line) depending on
  // whether one is already active, so the template only ever needs one
  // click handler per row instead of separate add/remove bindings. The
  // flyout itself stays open afterwards so several materials can be picked
  // in one go.
  protected toggleProduct(product: ProductProfile): void {
    const activeIndex = this.activeProductLineIndex().get(product.id);
    if (activeIndex != null) {
      this.removeLine(activeIndex);
      return;
    }
    this.addProductFromCatalog(product);
  }

  private createServiceLineGroup(initial?: {
    serviceId: string | null;
    name: string;
    description: string;
    amountEuros: number;
    visibility: ServiceLineVisibility;
    redistributionStrategy: RedistributionStrategy;
    weights: number[];
    pricingMode?: ServicePricingMode;
    percentageBasisPoints?: number | null;
    catalogServiceId?: string | null;
  }): InvoiceServiceLineFormGroup {
    const group = this.fb.nonNullable.group({
      serviceId: this.fb.control<string | null>(initial?.serviceId ?? null),
      name: this.fb.nonNullable.control(initial?.name ?? '', Validators.required),
      description: this.fb.nonNullable.control(initial?.description ?? ''),
      amountEuros: this.fb.nonNullable.control(initial?.amountEuros ?? 0, [
        Validators.required,
        Validators.min(0),
      ]),
      visibility: this.fb.nonNullable.control<ServiceLineVisibility>(
        initial?.visibility ?? 'VISIBLE',
      ),
      redistributionStrategy: this.fb.nonNullable.control<RedistributionStrategy>(
        initial?.redistributionStrategy ?? 'EQUAL',
      ),
      weights: this.fb.array<FormControl<number>>(
        (initial?.weights ?? []).map((weight) =>
          this.fb.nonNullable.control(weight, [Validators.required, Validators.min(0)]),
        ),
      ),
      pricingMode: this.fb.nonNullable.control<ServicePricingMode>(initial?.pricingMode ?? 'FIXED'),
      percentageBasisPoints: this.fb.control<number | null>(initial?.percentageBasisPoints ?? null),
      // Phase 13.5, UI-only: see InvoiceServiceLineDraft.catalogServiceId.
      catalogServiceId: this.fb.control<string | null>(initial?.catalogServiceId ?? null),
      // UI-only: whether to save/update this line's catalog Service on
      // submit — never sent as-is to the invoice-creation request, mirrors
      // the product line's saveAsNewProduct.
      saveAsNewService: this.fb.nonNullable.control(false),
    });
    this.syncServiceLineWeights(group);
    return group;
  }

  // Keeps a service line's `weights` FormArray sized to exactly the current
  // number of invoice lines — one weight input per line, in order — so the
  // form is always ready to submit a WEIGHTED redistribution even though the
  // weight inputs are only shown once that strategy is picked (see
  // InvoiceServiceLineFormComponent).
  private syncServiceLineWeights(group: InvoiceServiceLineFormGroup): void {
    const weights = group.controls.weights;
    while (weights.length < this.lines.length) {
      weights.push(this.fb.nonNullable.control(1, [Validators.required, Validators.min(0)]));
    }
    while (weights.length > this.lines.length) {
      weights.removeAt(weights.length - 1);
    }
  }

  private syncAllServiceLineWeights(): void {
    this.serviceLines.controls.forEach((group) => this.syncServiceLineWeights(group));
  }

  // Phase 13.5 gallery redesign: the "+ Prestation libre" flyout entry — a
  // blank card, never tied to a catalog Service.
  protected addFreeServiceLine(): void {
    this.serviceLines.push(this.createServiceLineGroup());
    this.servicePanelOpen.set(false);
  }

  // Phase 11/13.5: same catalog prefill as addProductFromCatalog above, for
  // a Service — visibility (and, for FIXED pricing, the amount) come
  // straight from the catalog entry, still fully editable afterwards. A
  // PERCENTAGE service's amount is never copied here — it's recomputed live
  // from percentageBasisPoints instead (see InvoiceDraftStore.resolved
  // ServiceAmountCents), matching "computed at build time, not typed per
  // invoice". Same "already known, straight to the card" treatment as
  // addProductFromCatalog — a catalog Service is already valid the moment
  // it's picked (name/amount both prefilled), so there's no reason to make
  // the artisan open the full form just to see it.
  private addServiceFromCatalog(service: ServiceProfile): void {
    const group = this.createServiceLineGroup({
      serviceId: service.id,
      name: service.name,
      description: service.description ?? '',
      amountEuros: service.pricingMode === 'FIXED' ? (service.priceCents ?? 0) / 100 : 0,
      visibility: service.defaultVisibility,
      redistributionStrategy: 'EQUAL',
      weights: [],
      pricingMode: service.pricingMode,
      percentageBasisPoints: service.percentageBasisPoints,
      catalogServiceId: service.id,
    });
    this.serviceLines.push(group);
    this.collapsedServiceLines.update((set) => new Set(set).add(group));
  }

  // The gallery card's always-visible visibility toggle (see
  // invoice-create-lines-step.page.html) — flips VISIBLE/REDISTRIBUTED
  // directly, without expanding the card. REDISTRIBUTED always lands on
  // EQUAL by default (already synced to one weight per line, see
  // syncServiceLineWeights) — a WEIGHTED split is still reachable by
  // expanding the card, but most margin-hiding needs nothing more than this.
  protected toggleServiceLineVisibility(group: InvoiceServiceLineFormGroup): void {
    const control = group.controls.visibility;
    control.setValue(control.value === 'VISIBLE' ? 'REDISTRIBUTED' : 'VISIBLE');
  }

  protected removeServiceLine(index: number): void {
    const group = this.serviceLines.at(index);
    this.serviceLines.removeAt(index);
    this.uncollapseServiceLine(group);
  }

  // Phase 13.5: same flyout toggle entry point as toggleProduct, for a Service.
  protected toggleService(service: ServiceProfile): void {
    const activeIndex = this.activeServiceLineIndex().get(service.id);
    if (activeIndex != null) {
      this.removeServiceLine(activeIndex);
      return;
    }
    this.addServiceFromCatalog(service);
  }

  // Phase 13.5 gallery redesign: opening one flyout closes the other, so
  // only one catalog list is ever open at a time.
  protected toggleProductPanel(): void {
    this.servicePanelOpen.set(false);
    this.productPanelOpen.update((open) => !open);
  }

  protected toggleServicePanel(): void {
    this.productPanelOpen.set(false);
    this.servicePanelOpen.update((open) => !open);
  }

  protected closePanels(): void {
    this.productPanelOpen.set(false);
    this.servicePanelOpen.set(false);
  }

  // Phase 13.5 gallery redesign: "Valider" on an expanded card — collapses
  // it into its compact gallery form once it actually holds valid data,
  // otherwise surfaces the same validation errors the full form already
  // knows how to show (markAllAsTouched), same pattern as submit() below.
  protected collapseLine(group: InvoiceLineFormGroup): void {
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.collapsedLines.update((set) => new Set(set).add(group));
  }

  protected expandLine(group: InvoiceLineFormGroup): void {
    this.collapsedLines.update((set) => {
      const next = new Set(set);
      next.delete(group);
      return next;
    });
  }

  protected isLineCollapsed(group: InvoiceLineFormGroup): boolean {
    return this.collapsedLines().has(group);
  }

  private uncollapseLine(group: InvoiceLineFormGroup): void {
    if (!this.collapsedLines().has(group)) {
      return;
    }
    this.collapsedLines.update((set) => {
      const next = new Set(set);
      next.delete(group);
      return next;
    });
  }

  protected collapseServiceLine(group: InvoiceServiceLineFormGroup): void {
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.collapsedServiceLines.update((set) => new Set(set).add(group));
  }

  protected expandServiceLine(group: InvoiceServiceLineFormGroup): void {
    this.collapsedServiceLines.update((set) => {
      const next = new Set(set);
      next.delete(group);
      return next;
    });
  }

  protected isServiceLineCollapsed(group: InvoiceServiceLineFormGroup): boolean {
    return this.collapsedServiceLines().has(group);
  }

  private uncollapseServiceLine(group: InvoiceServiceLineFormGroup): void {
    if (!this.collapsedServiceLines().has(group)) {
      return;
    }
    this.collapsedServiceLines.update((set) => {
      const next = new Set(set);
      next.delete(group);
      return next;
    });
  }

  protected back(): void {
    this.router.navigate(['/factures/nouvelle/rapide/client']);
  }

  // Phase 15: this step no longer creates the invoice itself — "Créer la
  // facture" only exists on the mandatory preview screen now (see
  // InvoiceCreatePreviewStepPage). This button's job is just to validate
  // what's here and hand off to it, same checks submit() used to run
  // before persisting.
  protected goToPreview(): void {
    if (
      !this.draftStore.canPreview() ||
      this.lines.invalid ||
      this.serviceLines.invalid ||
      this.draftStore.customer().customerName.trim().length === 0
    ) {
      this.lines.markAllAsTouched();
      this.serviceLines.markAllAsTouched();
      this.errorMessage.set(
        'Merci de renseigner un client et au moins une ligne complète avant de voir l’aperçu.',
      );
      return;
    }

    // Make sure the store has this step's very latest values before
    // navigating away — valueChanges already keeps it in sync, but this
    // removes any doubt about subscription timing, and the FormArrays
    // themselves are gone once InvoiceCreateLinesStepPage is destroyed.
    this.draftStore.setLines(this.lines.getRawValue());
    this.draftStore.setServiceLines(this.serviceLines.getRawValue());
    this.errorMessage.set(null);
    this.router.navigate(['/factures/nouvelle/rapide/apercu']);
  }
}
