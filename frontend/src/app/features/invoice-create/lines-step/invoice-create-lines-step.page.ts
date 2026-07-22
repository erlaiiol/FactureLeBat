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
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  InvoiceWithTotals,
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../../core/models/invoice.model';
import { ProductProfile } from '../../../core/models/product.model';
import { ServiceProfile } from '../../../core/models/service.model';
import { Unit } from '../../../core/models/unit.model';
import { CustomerService } from '../../../core/services/customer.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ProductService } from '../../../core/services/product.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { CatalogPickerComponent } from '../components/catalog-picker.component';
import {
  InvoiceLineFormComponent,
  InvoiceLineFormGroup,
} from '../components/invoice-line-form.component';
import {
  InvoiceServiceLineFormComponent,
  InvoiceServiceLineFormGroup,
} from '../components/invoice-service-line-form.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 6, step 2: dedicated product/service picker + creation screen, and
// the final "Créer la facture" submit. Same FormArray-based line/service-line
// editing as the pre-Phase-6 single page, but seeded from — and continuously
// synced back into — the shared InvoiceDraftStore so the shell's total and
// preview button reflect this step's edits immediately.
@Component({
  selector: 'app-invoice-create-lines-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BigButtonComponent,
    CatalogPickerComponent,
    InvoiceLineFormComponent,
    InvoiceServiceLineFormComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-lines-step.page.html',
})
export class InvoiceCreateLinesStepPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly customerService = inject(CustomerService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);

  protected readonly lines = this.fb.array<InvoiceLineFormGroup>(
    this.draftStore.lines().length > 0
      ? this.draftStore.lines().map((line) => this.createLineGroup(line))
      : [this.createLineGroup()],
  );

  private readonly linesValue = toSignal(this.lines.valueChanges, {
    initialValue: this.lines.getRawValue(),
  });

  protected readonly serviceLines = this.fb.array<InvoiceServiceLineFormGroup>(
    this.draftStore.serviceLines().map((serviceLine) => this.createServiceLineGroup(serviceLine)),
  );

  protected readonly lineLabels = computed(() =>
    this.linesValue().map((line, index) => line.description || `Ligne ${index + 1}`),
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
    });
  }

  protected addLine(): void {
    this.lines.push(this.createLineGroup());
    this.syncAllServiceLineWeights();
  }

  // Phase 11: catalog-driven invoicing. Picking a catalog Product prefills
  // everything the invoice line needs except quantity (the one field the
  // artisan still normally types) — same "autofill, not a lock" rule as
  // every other soft catalog reference in this app: the pushed line stays
  // fully editable afterwards. `quantity` is left at 0 (invalid) rather than
  // defaulted to 1, so an artisan can never submit a catalog line without
  // having actually looked at the quantity field.
  protected addProductFromCatalog(product: ProductProfile): void {
    this.lines.push(
      this.createLineGroup({
        description: product.name,
        unit: product.unit,
        quantity: 0,
        unitPriceEuros: product.priceCents / 100,
        wasteSurcharge: 'NONE',
        packagingQuantity: product.packagingQuantity ? Number(product.packagingQuantity) : null,
        roundUpToPackaging: true,
        productCode: product.code,
      }),
    );
    this.syncAllServiceLineWeights();
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
      this.syncAllServiceLineWeights();
    }
  }

  private createServiceLineGroup(initial?: {
    serviceId: string | null;
    name: string;
    description: string;
    amountEuros: number;
    visibility: ServiceLineVisibility;
    redistributionStrategy: RedistributionStrategy;
    weights: number[];
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

  protected addServiceLine(): void {
    this.serviceLines.push(this.createServiceLineGroup());
  }

  // Phase 11: same catalog prefill as addProductFromCatalog above, for a
  // Service — amount/visibility come straight from the catalog entry, still
  // fully editable afterwards.
  protected addServiceFromCatalog(service: ServiceProfile): void {
    this.serviceLines.push(
      this.createServiceLineGroup({
        serviceId: service.id,
        name: service.name,
        description: service.description ?? '',
        amountEuros: service.priceCents / 100,
        visibility: service.defaultVisibility,
        redistributionStrategy: 'EQUAL',
        weights: [],
      }),
    );
  }

  protected removeServiceLine(index: number): void {
    this.serviceLines.removeAt(index);
  }

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
  }

  protected back(): void {
    this.router.navigate(['/factures/nouvelle/rapide/client']);
  }

  protected startNewInvoice(): void {
    this.createdInvoice.set(null);
    this.errorMessage.set(null);
    this.draftStore.reset();
    this.router.navigate(['/factures/nouvelle/rapide/client']);
  }

  protected submit(): void {
    if (this.creating()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (
      !this.draftStore.canPreview() ||
      this.lines.invalid ||
      this.serviceLines.invalid ||
      this.draftStore.customer().customerName.trim().length === 0
    ) {
      this.lines.markAllAsTouched();
      this.serviceLines.markAllAsTouched();
      this.errorMessage.set(
        'Merci de renseigner un client et au moins une ligne complète avant de créer la facture.',
      );
      return;
    }

    // Make sure the store has this step's very latest values before
    // building the request — valueChanges already keeps it in sync, but
    // this removes any doubt about subscription timing at submit time.
    this.draftStore.setLines(this.lines.getRawValue());
    this.draftStore.setServiceLines(this.serviceLines.getRawValue());

    const customer = this.draftStore.customer();
    this.creating.set(true);
    this.errorMessage.set(null);

    // "Enregistrer ce produit" only saves the catalog-appropriate fields
    // (name/unit/price/packaging/code) — never `quantity`, `wasteSurcharge`,
    // or `roundUpToPackaging`, which describe this chantier, not the
    // product itself. Best-effort: a failed catalog save (e.g. a duplicate
    // code) must never block the invoice itself from being created.
    const productSaveRequests = this.lines
      .getRawValue()
      .filter((line) => line.saveAsNewProduct)
      .map((line) =>
        this.productService
          .create({
            name: line.description,
            unit: line.unit,
            priceCents: Math.round(line.unitPriceEuros * 100),
            code: line.productCode || undefined,
            packagingQuantity: line.packagingQuantity ?? undefined,
          })
          .pipe(catchError(() => of(null))),
      );
    // Normalized to Observable<null> on both branches — a ternary between
    // differently-typed Observables otherwise loses its generic argument
    // when piped below (TS falls back to the no-op 0-arg pipe() overload).
    const saveProducts$: Observable<null> =
      productSaveRequests.length > 0
        ? forkJoin(productSaveRequests).pipe(map(() => null))
        : of(null);

    // "Enregistrer ce client" only applies to freehand entry — if a saved
    // customer was picked, there's nothing new to save.
    const request$ = saveProducts$.pipe(
      switchMap(() =>
        customer.saveAsNewCustomer && !customer.customerId
          ? this.customerService
              .create({
                name: customer.customerName,
                address: customer.customerAddress || undefined,
                email: customer.customerEmail || undefined,
                phone: customer.customerPhone || undefined,
              })
              .pipe(
                switchMap((newCustomer) =>
                  this.invoiceService.create(this.draftStore.buildInvoiceRequest(newCustomer.id)),
                ),
              )
          : this.invoiceService.create(
              this.draftStore.buildInvoiceRequest(customer.customerId ?? undefined),
            ),
      ),
    );

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (invoice) => {
        this.creating.set(false);
        this.createdInvoice.set(invoice);
        this.draftStore.reset();
      },
      error: () => {
        this.creating.set(false);
        this.errorMessage.set('Erreur lors de la création de la facture. Veuillez réessayer.');
      },
    });
  }
}
