import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
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
import { DiscountProfile, DiscountType } from '../../../core/models/discount.model';
import { ProductProfile } from '../../../core/models/product.model';
import { ActivityCategory } from '../../../core/models/report.model';
import { ServicePricingMode, ServiceProfile } from '../../../core/models/service.model';
import { Unit } from '../../../core/models/unit.model';
import { BadgeComponent } from '../../../shared/components/badge.component';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconCheckComponent } from '../../../shared/components/icon-check.component';
import { IconCloseComponent } from '../../../shared/components/icon-close.component';
import { IconEyeComponent } from '../../../shared/components/icon-eye.component';
import { IconEyeOffComponent } from '../../../shared/components/icon-eye-off.component';
import { LineBadgeComponent } from '../../../shared/components/line-badge.component';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { QuantityLabelPipe } from '../../../shared/pipes/quantity-label.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { TourService } from '../../../shared/tour/tour.service';
import { computeLineTotalPreviewCents } from '../calculation-preview';
import {
  InvoiceDiscountLineFormComponent,
  InvoiceDiscountLineFormGroup,
} from '../components/invoice-discount-line-form.component';
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
    BadgeComponent,
    BigButtonComponent,
    IconCheckComponent,
    IconCloseComponent,
    IconEyeComponent,
    IconEyeOffComponent,
    LineBadgeComponent,
    CentsToEurosPipe,
    QuantityLabelPipe,
    UnitLabelPipe,
    InvoiceLineFormComponent,
    InvoiceServiceLineFormComponent,
    InvoiceDiscountLineFormComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-lines-step.page.html',
})
export class InvoiceCreateLinesStepPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly draftStore = inject(InvoiceDraftStore);
  private readonly tourService = inject(TourService);

  protected readonly errorMessage = signal<string | null>(null);
  // Phase 13.5 gallery redesign: which of the three fixed "+" flyouts is
  // open — mutually exclusive, opening one closes the other two.
  protected readonly productPanelOpen = signal(false);
  protected readonly servicePanelOpen = signal(false);
  // Phase 32.
  protected readonly discountPanelOpen = signal(false);

  // The guided tour's 'add-line' step targets these buttons while they're
  // collapsed to their bare "+" circle — its label span is a 0fr grid track
  // at rest (see .fixed-add-button in styles.css) and only opens up on
  // hover or productPanelOpen/servicePanelOpen, neither of which the tour
  // itself triggers. Without this, the tour's spotlight (sized off the
  // button's own getBoundingClientRect — see TourOverlayComponent) only
  // ever highlights the "+" glyph, never the "Ajouter un produit/prestation"
  // label the step's own copy is telling the artisan to look for. Reusing
  // is-open here expands the button to reveal that label WHILE the step is
  // showing, and TourOverlayComponent's keepMeasuringWhileSettling already
  // re-measures for 600ms after every step change — long enough to catch
  // the CSS grid-template-columns transition settling on its wider size.
  protected readonly productButtonTourHighlighted = computed(
    () => this.tourService.currentStep()?.anchorId === 'invoice-add-product-button',
  );
  protected readonly serviceButtonTourHighlighted = computed(
    () => this.tourService.currentStep()?.anchorId === 'invoice-add-service-button',
  );
  protected readonly discountButtonTourHighlighted = computed(
    () => this.tourService.currentStep()?.anchorId === 'invoice-add-discount-button',
  );

  // Holds both "+" buttons open on first mount so their "Ajouter un
  // produit"/"Ajouter une prestation" label is readable before collapsing
  // into the bare "+" circle — same is-open mechanism as the panel-open and
  // tour-highlight states above, just time-driven instead of user-driven.
  // Desktop-only (`sm` breakpoint, matching styles.css's .fixed-add-flyout
  // and this page's own fixed-position container): on a phone the two "+"
  // circles are already a large, obviously-tappable fraction of the
  // viewport (see ux-roadmap.md's mobile-first vision) the way they never
  // are on a 15"+ screen, so there's nothing this reveal explains that the
  // button itself doesn't already — it would just cover the page the
  // artisan just landed on with two expanded pills for no reason.
  protected readonly introExpanded = signal(window.matchMedia('(min-width: 640px)').matches);

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

  protected readonly discountLines = this.fb.array<InvoiceDiscountLineFormGroup>(
    this.draftStore
      .discountLines()
      .map((discountLine) => this.createDiscountLineGroup(discountLine)),
  );

  private readonly discountLinesValue = toSignal(this.discountLines.valueChanges, {
    initialValue: this.discountLines.getRawValue(),
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
  protected readonly collapsedDiscountLines = signal<ReadonlySet<InvoiceDiscountLineFormGroup>>(
    new Set(this.discountLines.controls.filter((group) => group.valid)),
  );

  protected readonly lineLabels = computed(() =>
    this.linesValue().map((line, index) => line.description || `Ligne ${index + 1}`),
  );

  // Phase 13.5: which catalog Products/Services have at least one active
  // line — purely a badge/checkmark signal for the flyout's catalog list
  // (see pickProduct/pickService below for why this can no longer double as
  // "which line to remove on a second click": clicking a catalog row now
  // always adds another line, never removes one).
  protected readonly activeProductIds = computed(() => {
    const ids = new Set<string>();
    this.linesValue().forEach((line) => {
      if (line.catalogProductId) {
        ids.add(line.catalogProductId);
      }
    });
    return ids;
  });

  protected readonly activeServiceIds = computed(() => {
    const ids = new Set<string>();
    this.serviceLinesValue().forEach((serviceLine) => {
      if (serviceLine.catalogServiceId) {
        ids.add(serviceLine.catalogServiceId);
      }
    });
    return ids;
  });

  protected readonly activeDiscountIds = computed(() => {
    const ids = new Set<string>();
    this.discountLinesValue().forEach((discountLine) => {
      if (discountLine.catalogDiscountId) {
        ids.add(discountLine.catalogDiscountId);
      }
    });
    return ids;
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

  // Same "always reflects the current base, never a stale snapshot" role as
  // serviceLineAmountsCents above, for discount lines.
  protected readonly discountLineAmountsCents = computed(() =>
    this.draftStore
      .discountLines()
      .map((discountLine) => this.draftStore.resolvedDiscountAmountCents(discountLine)),
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
    this.discountLines.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.draftStore.setDiscountLines(this.discountLines.getRawValue());
    });

    if (this.introExpanded()) {
      const introTimer = setTimeout(() => this.introExpanded.set(false), 3000);
      this.destroyRef.onDestroy(() => clearTimeout(introTimer));
    }
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
    activityCategory?: ActivityCategory | null;
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
      // Phase 17: UI-only carry-through, not rendered by this step's own
      // template — see InvoiceLineDraft.activityCategory.
      activityCategory: this.fb.control<ActivityCategory | null>(initial?.activityCategory ?? null),
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
    // Only the first line for a given catalog Product stays "linked" to it
    // (catalogProductId set) — a second pick of the same product prefills
    // an independent line instead, since only one line can ever be the
    // thing "Mettre à jour ce produit dans le catalogue" updates in place
    // (see persistFreeEntities in InvoiceDraftStore, which fires one update
    // request per distinct catalogProductId). Leaving it unlinked here means
    // InvoiceLineFormComponent.isCatalogLinked() is false on it, so it reads
    // — and, if saved, behaves — as a fresh line that creates a new catalog
    // entry rather than colliding with the first one's update.
    const alreadyLinked = this.activeProductIds().has(product.id);
    const group = this.createLineGroup({
      description: product.name,
      unit: product.unit,
      quantity: 0,
      unitPriceEuros: product.priceCents / 100,
      wasteSurcharge: 'NONE',
      packagingQuantity: product.packagingQuantity ? Number(product.packagingQuantity) : null,
      roundUpToPackaging: true,
      productCode: product.code,
      catalogProductId: alreadyLinked ? null : product.id,
      activityCategory: product.activityCategory,
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

  // Phase 13.5: the catalog flyout's entry point for a Product row — always
  // adds another line (never removes one; that's the card's own "Supprimer"
  // button, see removeLine). Picking the same product twice in a row means
  // two lines, same as picking two different products — a checkmark badge
  // (see activeProductIds) still shows the product has at least one active
  // line, but clicking it again is never interpreted as "undo that". Closes
  // the flyout right after, matching addFreeLine/addFreeServiceLine: an
  // artisan who wants a second unit reopens the "+" button, they don't get
  // it for free by the flyout staying open.
  protected pickProduct(product: ProductProfile): void {
    this.addProductFromCatalog(product);
    this.closePanels();
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
    activityCategory?: ActivityCategory | null;
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
      // Phase 17: UI-only carry-through — see InvoiceServiceLineDraft.activityCategory.
      activityCategory: this.fb.control<ActivityCategory | null>(initial?.activityCategory ?? null),
    });
    this.syncServiceLineWeights(group);
    this.syncServiceLinePricingValidators(group);
    group.controls.pricingMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncServiceLinePricingValidators(group));
    return group;
  }

  // A PERCENTAGE line's real amount comes from percentageBasisPoints, not
  // amountEuros (see InvoiceDraftStore.resolvedServiceAmountCents) — swap
  // which of the two carries the "must be a positive value" validator so
  // switching mode can't leave a stale, unvalidated field that would
  // silently resolve to a €0 line (amountEuros just isn't sent when
  // PERCENTAGE, and percentageBasisPoints defaults to null).
  private syncServiceLinePricingValidators(group: InvoiceServiceLineFormGroup): void {
    const amountEuros = group.controls.amountEuros;
    const percentageBasisPoints = group.controls.percentageBasisPoints;
    if (group.controls.pricingMode.value === 'PERCENTAGE') {
      amountEuros.clearValidators();
      percentageBasisPoints.setValidators([Validators.required, Validators.min(1)]);
    } else {
      amountEuros.setValidators([Validators.required, Validators.min(0)]);
      percentageBasisPoints.clearValidators();
    }
    amountEuros.updateValueAndValidity({ emitEvent: false });
    percentageBasisPoints.updateValueAndValidity({ emitEvent: false });
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
    // Same "only the first pick stays linked" rule as addProductFromCatalog
    // above, for the same reason: persistFreeEntities fires one update
    // request per distinct catalogServiceId, so a second line for the same
    // Service must create a new one instead of racing the first line's
    // update.
    const alreadyLinked = this.activeServiceIds().has(service.id);
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
      catalogServiceId: alreadyLinked ? null : service.id,
      activityCategory: service.activityCategory,
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

  // Phase 13.5: same flyout entry point as pickProduct, for a Service —
  // always adds another line and closes the flyout.
  protected pickService(service: ServiceProfile): void {
    this.addServiceFromCatalog(service);
    this.closePanels();
  }

  private createDiscountLineGroup(initial?: {
    discountId: string | null;
    name: string;
    discountType?: DiscountType;
    fixedAmountEuros: number;
    percentageBasisPoints?: number | null;
    catalogDiscountId?: string | null;
  }): InvoiceDiscountLineFormGroup {
    const group = this.fb.nonNullable.group({
      discountId: this.fb.control<string | null>(initial?.discountId ?? null),
      name: this.fb.nonNullable.control(initial?.name ?? '', Validators.required),
      discountType: this.fb.nonNullable.control<DiscountType>(initial?.discountType ?? 'FIXED'),
      fixedAmountEuros: this.fb.nonNullable.control(initial?.fixedAmountEuros ?? 0, [
        Validators.required,
        Validators.min(0),
      ]),
      percentageBasisPoints: this.fb.control<number | null>(initial?.percentageBasisPoints ?? null),
      // Phase 32, UI-only: see InvoiceDiscountLineDraft.catalogDiscountId.
      catalogDiscountId: this.fb.control<string | null>(initial?.catalogDiscountId ?? null),
      // UI-only: whether to save/update this line's catalog Discount on
      // submit — never sent as-is to the invoice-creation request, mirrors
      // the service line's saveAsNewService.
      saveAsNewDiscount: this.fb.nonNullable.control(false),
    });
    this.syncDiscountLinePricingValidators(group);
    group.controls.discountType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDiscountLinePricingValidators(group));
    return group;
  }

  // Same "swap which of the two carries the required validator" rule as
  // syncServiceLinePricingValidators above.
  private syncDiscountLinePricingValidators(group: InvoiceDiscountLineFormGroup): void {
    const fixedAmountEuros = group.controls.fixedAmountEuros;
    const percentageBasisPoints = group.controls.percentageBasisPoints;
    if (group.controls.discountType.value === 'PERCENTAGE') {
      fixedAmountEuros.clearValidators();
      percentageBasisPoints.setValidators([Validators.required, Validators.min(1)]);
    } else {
      fixedAmountEuros.setValidators([Validators.required, Validators.min(0)]);
      percentageBasisPoints.clearValidators();
    }
    fixedAmountEuros.updateValueAndValidity({ emitEvent: false });
    percentageBasisPoints.updateValueAndValidity({ emitEvent: false });
  }

  // Phase 32 gallery redesign: the "+ Nouvelle remise" flyout entry — a
  // blank card, never tied to a catalog Discount.
  protected addFreeDiscountLine(): void {
    this.discountLines.push(this.createDiscountLineGroup());
    this.discountPanelOpen.set(false);
  }

  // Same "only the first pick stays linked" rule as addProductFromCatalog/
  // addServiceFromCatalog above, for the same reason: persistFreeEntities
  // fires one update request per distinct catalogDiscountId.
  private addDiscountFromCatalog(discount: DiscountProfile): void {
    const alreadyLinked = this.activeDiscountIds().has(discount.id);
    const group = this.createDiscountLineGroup({
      discountId: discount.id,
      name: discount.name,
      discountType: discount.discountType,
      fixedAmountEuros:
        discount.discountType === 'FIXED' ? (discount.fixedAmountCents ?? 0) / 100 : 0,
      percentageBasisPoints: discount.percentageBasisPoints,
      catalogDiscountId: alreadyLinked ? null : discount.id,
    });
    this.discountLines.push(group);
    this.collapsedDiscountLines.update((set) => new Set(set).add(group));
  }

  protected removeDiscountLine(index: number): void {
    const group = this.discountLines.at(index);
    this.discountLines.removeAt(index);
    this.uncollapseDiscountLine(group);
  }

  // Same flyout entry point as pickProduct/pickService, for a Discount —
  // always adds another line and closes the flyout.
  protected pickDiscount(discount: DiscountProfile): void {
    this.addDiscountFromCatalog(discount);
    this.closePanels();
  }

  protected collapseDiscountLine(group: InvoiceDiscountLineFormGroup): void {
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedDiscountLines.update((set) => new Set(set).add(group));
      },
      true,
    );
  }

  protected expandDiscountLine(group: InvoiceDiscountLineFormGroup): void {
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedDiscountLines.update((set) => {
          const next = new Set(set);
          next.delete(group);
          return next;
        });
      },
      false,
    );
  }

  protected isDiscountLineCollapsed(group: InvoiceDiscountLineFormGroup): boolean {
    return this.collapsedDiscountLines().has(group);
  }

  private uncollapseDiscountLine(group: InvoiceDiscountLineFormGroup): void {
    if (!this.collapsedDiscountLines().has(group)) {
      return;
    }
    this.collapsedDiscountLines.update((set) => {
      const next = new Set(set);
      next.delete(group);
      return next;
    });
  }

  // Phase 13.5 gallery redesign: opening one flyout closes the other two, so
  // only one catalog list is ever open at a time.
  protected toggleProductPanel(): void {
    this.servicePanelOpen.set(false);
    this.discountPanelOpen.set(false);
    this.productPanelOpen.update((open) => !open);
  }

  protected toggleServicePanel(): void {
    this.productPanelOpen.set(false);
    this.discountPanelOpen.set(false);
    this.servicePanelOpen.update((open) => !open);
  }

  protected toggleDiscountPanel(): void {
    this.productPanelOpen.set(false);
    this.servicePanelOpen.set(false);
    this.discountPanelOpen.update((open) => !open);
  }

  protected closePanels(): void {
    this.productPanelOpen.set(false);
    this.servicePanelOpen.set(false);
    this.discountPanelOpen.set(false);
  }

  // cardMorph (design-system.md): a real FLIP transition between a card's
  // full-form and compact-gallery states, in both directions ("Valider"
  // collapses, clicking a compact card re-expands it). Distorting a card
  // with `transform: scale()` stretches its border/radius/shadow/text
  // non-uniformly and reads as cheap — this instead measures the outgoing
  // card's actual on-screen rect, then pins the incoming card (already laid
  // out at its own real resting size) at that exact rect the instant it
  // mounts, and animates real width/height/position back to its own rect.
  // Content never distorts because the box's real dimensions are what's
  // animating, not a stretched snapshot. morphIds gives every line/
  // service-line group a stable DOM hook (data-morph-id) that survives the
  // swap between the expanded-form template and the compact-card template,
  // since nothing else ties the two together.
  private readonly morphIds = new WeakMap<object, string>();

  protected morphId(group: object): string {
    let id = this.morphIds.get(group);
    if (!id) {
      id = `morph-${Math.random().toString(36).slice(2)}`;
      this.morphIds.set(group, id);
    }
    return id;
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
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedLines.update((set) => new Set(set).add(group));
      },
      true,
    );
  }

  protected expandLine(group: InvoiceLineFormGroup): void {
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedLines.update((set) => {
          const next = new Set(set);
          next.delete(group);
          return next;
        });
      },
      false,
    );
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
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedServiceLines.update((set) => new Set(set).add(group));
      },
      true,
    );
  }

  protected expandServiceLine(group: InvoiceServiceLineFormGroup): void {
    this.morphCard(
      this.morphId(group),
      () => {
        this.collapsedServiceLines.update((set) => {
          const next = new Set(set);
          next.delete(group);
          return next;
        });
      },
      false,
    );
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

  // Measures the outgoing card's rect, runs `commit` (the state flip that
  // swaps which of the two templates renders), then — once Angular has
  // mounted the replacement but before the browser paints it — pins that
  // replacement at the outgoing rect and animates it to its own natural
  // rect (see playCardMorph). Skipped under prefers-reduced-motion
  // (design-system.md's motion rules: resolve straight to `commit`'s
  // result) and whenever there's no outgoing element to measure — e.g. a
  // catalog pick that starts collapsed with no expanded form ever having
  // existed (see addProductFromCatalog/addServiceFromCatalog), which just
  // keeps its plain anim-line-in fade-in instead.
  private morphCard(morphId: string, commit: () => void, isCollapse: boolean): void {
    const outgoingEl = document.querySelector<HTMLElement>(`[data-morph-id="${morphId}"]`);
    const fromRect = outgoingEl?.getBoundingClientRect() ?? null;

    commit();

    if (!fromRect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    afterNextRender(
      {
        mixedReadWrite: () => {
          const incomingEl = document.querySelector<HTMLElement>(`[data-morph-id="${morphId}"]`);
          if (incomingEl) {
            this.playCardMorph(incomingEl, fromRect, isCollapse);
          }
        },
      },
      { injector: this.injector },
    );
  }

  // The FLIP itself: `el` is already laid out at its real resting rect (by
  // Angular + CSS grid) the moment this runs — read that as `to`, then pin
  // `el` at `from`'s position/size via inline styles and let the Web
  // Animations API carry it back to `to`. Vertical (top/height) resolves
  // first, horizontal (left/width) second (the 0.55 offset), with a light
  // spring overshoot on the settle — the same texture as a native sheet or
  // card transition, not a linear resize. Real width/height/position
  // animate here, never `transform: scale`, so the card's own border/
  // radius/shadow never stretch.
  //
  // That alone leaves the text/inputs inside looking disconnected though —
  // a plain block child's width defaults to filling its parent, so
  // `.morph-content` would keep stretching to match `el`'s own
  // still-animating width and never look like it's shrinking on its own.
  // Pinning it to `to.width` up front (`overflow: hidden` on `el` clips the
  // brief mismatch while `el` is still far from that size) gives it a
  // *stable* base size for the whole animation, and — collapsing only,
  // where the content really did just get smaller — a uniform `scale()` on
  // top of that stable base (never non-uniform scaleX/scaleY, which is
  // what stretches text) makes it visibly shrink in lockstep with the box.
  // Expanding skips the content scale: the form's fields are already
  // correctly laid out at their final width the whole time, so growing the
  // box around them (revealed via the same overflow: hidden) is enough —
  // scaling already-correct fields would just be motion for its own sake.
  private playCardMorph(el: HTMLElement, from: DOMRect, isCollapse: boolean): void {
    const to = el.getBoundingClientRect();
    const previousStyle = el.getAttribute('style');

    // `el` is about to leave the grid/flex flow (`position: fixed` below)
    // for the whole animation — without something else holding its slot
    // open, the container closes that gap immediately (every sibling
    // shifts to fill it), then reopens it just as abruptly the moment `el`
    // lands back in flow at the end. A same-size, invisible placeholder
    // takes over `el`'s exact slot for the duration instead, so every
    // sibling's layout stays completely still while `el` is the one thing
    // visibly moving — removed the instant `el` resumes its normal
    // position, at exactly the rect the placeholder was already holding.
    const placeholder = document.createElement('div');
    placeholder.style.width = `${to.width}px`;
    placeholder.style.height = `${to.height}px`;
    placeholder.style.visibility = 'hidden';
    placeholder.setAttribute('aria-hidden', 'true');
    el.before(placeholder);

    Object.assign(el.style, {
      position: 'fixed',
      margin: '0',
      zIndex: '30',
      overflow: 'hidden',
      top: `${from.top}px`,
      left: `${from.left}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });

    const restore = (): void => {
      placeholder.remove();
      if (previousStyle) {
        el.setAttribute('style', previousStyle);
      } else {
        el.removeAttribute('style');
      }
    };

    // A spring/overshoot easing applied as a single top-level `options.
    // easing` warps the *whole* 0–1 timeline non-linearly (that's the whole
    // point of an overshoot curve — it races past 1 before settling back),
    // which blows straight through the offset: 0.55 boundary early and
    // starts the horizontal move mid-vertical-phase. Setting `easing` on
    // each keyframe instead scopes it to that keyframe's own segment
    // (spec'd, local progress only) — the vertical phase (0–55%) and
    // horizontal phase (55–100%) each get their own clean spring, and stay
    // sequential instead of bleeding into each other. A gentler overshoot
    // (1.15 vs. the more common 1.56) reads as a smooth settle rather than
    // a bounce.
    const duration = 540;
    const spring = 'cubic-bezier(0.33, 1.15, 0.5, 1)';
    const animation = el.animate(
      [
        {
          top: `${from.top}px`,
          left: `${from.left}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
          boxShadow: '0 20px 40px -12px rgb(0 0 0 / 0.25)',
          easing: spring,
        },
        {
          top: `${to.top}px`,
          left: `${from.left}px`,
          width: `${from.width}px`,
          height: `${to.height}px`,
          offset: 0.55,
          boxShadow: '0 20px 40px -12px rgb(0 0 0 / 0.18)',
          easing: spring,
        },
        {
          top: `${to.top}px`,
          left: `${to.left}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        },
      ],
      { duration, fill: 'forwards' },
    );

    const content = el.querySelector<HTMLElement>('.morph-content');
    let contentAnimation: Animation | null = null;
    let previousContentStyle: string | null = null;
    if (content) {
      previousContentStyle = content.getAttribute('style');
      content.style.width = `${to.width}px`;

      if (isCollapse) {
        // How much bigger the content looked inside the outgoing rect than
        // it will once settled — derived from the actual area ratio (not a
        // fixed guess) so a short one-line card and a long multi-field form
        // each get a scale matching how dramatic their own resize really
        // is, clamped so neither a tiny nor a huge difference ever looks
        // absurd.
        const areaRatio = (from.width * from.height) / (to.width * to.height);
        const startScale = Math.min(Math.max(Math.sqrt(areaRatio), 1.15), 1.6);
        content.style.transformOrigin = 'top center';
        contentAnimation = content.animate(
          [{ transform: `scale(${startScale})`, easing: spring }, { transform: 'scale(1)' }],
          { duration, fill: 'forwards' },
        );
      }
    }

    // Content stays pinned exactly as long as the box is animating —
    // whether or not it also got its own scale animation above, it must
    // only let go of its temporary width once `el` itself has settled,
    // never on its own separate (and, when there's no scale animation,
    // otherwise-immediate) timer.
    const cleanup = (): void => {
      restore();
      animation.cancel();
      if (content) {
        if (previousContentStyle) {
          content.setAttribute('style', previousContentStyle);
        } else {
          content.removeAttribute('style');
        }
        contentAnimation?.cancel();
      }
    };

    animation.finished.then(cleanup).catch(cleanup);
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
      this.discountLines.invalid ||
      this.draftStore.customer().customerName.trim().length === 0
    ) {
      this.lines.markAllAsTouched();
      this.serviceLines.markAllAsTouched();
      this.discountLines.markAllAsTouched();
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
    this.draftStore.setDiscountLines(this.discountLines.getRawValue());
    this.errorMessage.set(null);
    this.router.navigate(['/factures/nouvelle/rapide/apercu']);
  }
}
