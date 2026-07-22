import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Unit,
  UNIT_LABELS,
  UNIT_OPTIONS,
  UNIT_PRICE_BUTTON_LABELS,
} from '../../core/models/unit.model';
import { ProductService } from '../../core/services/product.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';

@Component({
  selector: 'app-product-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './product-form.page.html',
})
export class ProductFormPage {
  protected readonly unitOptions = UNIT_OPTIONS;

  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly productId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.productId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // Import-from-URL is only offered on first entry — editing an existing
  // product is already a deliberate, reviewed action.
  protected readonly importUrl = this.fb.nonNullable.control('');
  protected readonly importing = signal(false);
  protected readonly importErrorMessage = signal<string | null>(null);

  // Used to phrase the packaging field's hint in the unit the artisan just
  // picked (e.g. "Vendu par colis de ... m²").
  protected readonly unitLabels = UNIT_LABELS;

  // UX follow-up: an artisan reads a packaging size off a supplier's price
  // list as "45€/m², 405€ la boîte" — not as "9 m² par boîte" — so the
  // artisan enters both real prices and the app deduces the packaging
  // quantity, instead of asking them to do that division themselves. The
  // package-price signal is local, UI-only convenience — never sent to the
  // backend; only the deduced packagingQuantity (a real form control) is
  // ever persisted.
  protected readonly packagePriceEuros = signal<number | null>(null);

  // Advanced escape hatch: an artisan who already knows the exact packaging
  // content (but not, or not precisely, the box price) can still type it
  // directly — same "autofill, not a lock" rule as every other soft
  // catalog/snapshot field in this codebase. Off by default since the
  // two-price flow above is the common case.
  protected readonly manualPackaging = signal(false);

  protected hasPackaging(): boolean {
    const packagingQuantity = this.form.controls.packagingQuantity.value;
    return packagingQuantity != null && packagingQuantity > 0;
  }

  protected unitPriceButtonLabel(): string {
    return UNIT_PRICE_BUTTON_LABELS[this.form.controls.unit.value];
  }

  protected enableManualPackaging(): void {
    this.manualPackaging.set(true);
  }

  // Leaving manual mode immediately re-derives packagingQuantity from
  // whatever the two price fields currently hold, so the two never silently
  // disagree once the artisan switches back.
  protected disableManualPackaging(): void {
    this.manualPackaging.set(false);
    this.recomputePackagingQuantity(this.form.controls.priceEuros.value, this.packagePriceEuros());
  }

  protected onUnitPriceInput(rawValue: string): void {
    this.recomputePackagingQuantity(Number(rawValue), this.packagePriceEuros());
  }

  protected onPackagePriceInput(rawValue: string): void {
    const packagePrice = Number(rawValue);
    this.packagePriceEuros.set(Number.isFinite(packagePrice) ? packagePrice : null);
    this.recomputePackagingQuantity(this.form.controls.priceEuros.value, packagePrice);
  }

  // The single place that deduces "how much is in one package" from the two
  // real prices — never runs while the artisan is using the manual override.
  private recomputePackagingQuantity(unitPrice: number, packagePrice: number | null): void {
    if (this.manualPackaging()) {
      return;
    }
    const packagingQuantityControl = this.form.controls.packagingQuantity;
    if (
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      packagePrice != null &&
      Number.isFinite(packagePrice) &&
      packagePrice > 0
    ) {
      packagingQuantityControl.setValue(Math.round((packagePrice / unitPrice) * 1000) / 1000);
    } else {
      packagingQuantityControl.setValue(null);
    }
  }

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    unit: this.fb.nonNullable.control<Unit>('SQUARE_METER', Validators.required),
    // Entered as a plain euro amount and converted to cents on submit — the
    // same boundary-conversion convention as the invoice line form.
    priceEuros: [0, [Validators.required, Validators.min(0)]],
    supplierName: [''],
    supplierUrl: ['', Validators.pattern(/^$|^https?:\/\/.+/)],
    // Phase 11: short artisan-defined reference (e.g. "UC204850").
    code: [''],
    // Phase 8.5: how many `unit`s come in one sellable package (e.g. 9 for
    // a 9 m² box). Left null when the product is sold continuously — most
    // products. `null` (not 0) is the "not set" value here, unlike
    // priceEuros, since a packaging quantity of 0 would be meaningless.
    packagingQuantity: this.fb.control<number | null>(null, Validators.min(0.001)),
  });

  constructor() {
    if (this.productId) {
      this.productService
        .getById(this.productId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (product) => {
            this.loading.set(false);
            this.form.patchValue({
              name: product.name,
              description: product.description ?? '',
              unit: product.unit,
              priceEuros: product.priceCents / 100,
              supplierName: product.supplierName ?? '',
              supplierUrl: product.supplierUrl ?? '',
              code: product.code ?? '',
              packagingQuantity: product.packagingQuantity
                ? Number(product.packagingQuantity)
                : null,
            });
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Impossible de charger ce produit.');
          },
        });
    }
  }

  protected importFromUrl(): void {
    if (this.importing()) {
      return; // already in flight — ignore a fast double click/tap
    }
    const url = this.importUrl.value.trim();
    if (!url) {
      return;
    }

    this.importing.set(true);
    this.importErrorMessage.set(null);

    this.productService
      .importFromUrl(url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draft) => {
          this.importing.set(false);
          // Autofill only — every field stays fully editable afterward, and
          // nothing here is saved until the artisan submits the form (see
          // conventions.md's "autofill, not a lock" rule).
          this.form.patchValue({
            name: draft.name ?? this.form.value.name ?? '',
            description: draft.description ?? this.form.value.description ?? '',
            unit: draft.unit ?? this.form.value.unit,
            priceEuros:
              draft.priceCents != null ? draft.priceCents / 100 : this.form.value.priceEuros,
            supplierName: draft.supplierName ?? this.form.value.supplierName ?? '',
            supplierUrl: draft.supplierUrl,
          });
        },
        error: () => {
          this.importing.set(false);
          this.importErrorMessage.set(
            "Impossible d'extraire les informations de cette page — vous pouvez remplir le formulaire à la main.",
          );
        },
      });
  }

  protected submit(): void {
    if (this.saving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      name: value.name,
      description: value.description || undefined,
      unit: value.unit,
      priceCents: Math.round(value.priceEuros * 100),
      supplierName: value.supplierName || undefined,
      supplierUrl: value.supplierUrl || undefined,
      code: value.code || undefined,
      packagingQuantity: value.packagingQuantity ?? undefined,
    };

    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.productId
      ? this.productService.update(this.productId, payload)
      : this.productService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/produits']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(
          error.status === 409
            ? 'Ce code produit est déjà utilisé par un autre produit.'
            : 'Erreur lors de l’enregistrement. Veuillez réessayer.',
        );
      },
    });
  }
}
