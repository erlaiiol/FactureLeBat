import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Unit, UNIT_LABELS, UNIT_OPTIONS } from '../../core/models/unit.model';
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

  // Phase 8.5 UX follow-up: "prix à l'unité" is the field that's actually
  // stored (priceEuros below), but an artisan buying glue in boxes knows
  // the box's real price, not a derived per-m² figure. This toggle and the
  // package-price input are UI-only convenience — never sent to the
  // backend — that compute priceEuros for them instead of asking them to
  // do the division themselves.
  protected readonly priceEntryMode = signal<'PER_UNIT' | 'PER_PACKAGE'>('PER_UNIT');
  protected readonly packagePriceEuros = signal<number | null>(null);

  protected hasPackaging(): boolean {
    const packagingQuantity = this.form.controls.packagingQuantity.value;
    return packagingQuantity != null && packagingQuantity > 0;
  }

  protected setPriceEntryMode(mode: 'PER_UNIT' | 'PER_PACKAGE'): void {
    if (mode === 'PER_PACKAGE') {
      const packagingQuantity = this.form.controls.packagingQuantity.value;
      if (packagingQuantity) {
        // Seed the package-price field from the current per-unit price so
        // switching modes doesn't reset to zero — the artisan can then
        // overwrite it with the box's real price.
        this.packagePriceEuros.set(
          Math.round(this.form.controls.priceEuros.value * packagingQuantity * 100) / 100,
        );
      }
    }
    this.priceEntryMode.set(mode);
  }

  protected onPackagePriceInput(rawValue: string): void {
    const packagePrice = Number(rawValue);
    this.packagePriceEuros.set(Number.isFinite(packagePrice) ? packagePrice : null);

    const packagingQuantity = this.form.controls.packagingQuantity.value;
    if (Number.isFinite(packagePrice) && packagingQuantity && packagingQuantity > 0) {
      this.form.controls.priceEuros.setValue(
        Math.round((packagePrice / packagingQuantity) * 100) / 100,
      );
    }
  }

  // Whichever way the artisan chooses to enter the price, show the other
  // one alongside it — so they can always check it against what their
  // supplier actually shows, per-unit or per-box.
  protected priceHint(): string {
    const packagingQuantity = this.form.controls.packagingQuantity.value;
    const unit = this.unitLabels[this.form.controls.unit.value];

    if (this.priceEntryMode() === 'PER_PACKAGE') {
      if (!packagingQuantity || this.packagePriceEuros() == null) {
        return `Le prix à l'unité (${unit}) sera calculé automatiquement à partir du prix du conditionnement.`;
      }
      const perUnit = this.form.controls.priceEuros.value.toFixed(2);
      return `${this.packagePriceEuros()} € pour ${packagingQuantity} ${unit} → ${perUnit} €/${unit}, calculé automatiquement.`;
    }

    const unitPrice = this.form.controls.priceEuros.value;
    if (packagingQuantity && packagingQuantity > 0 && unitPrice > 0) {
      const packagePrice = (unitPrice * packagingQuantity).toFixed(2);
      return `Le prix pour une seule unité (${unit}), sera pré-rempli sur vos factures — soit ${packagePrice} € pour un conditionnement de ${packagingQuantity} ${unit}.`;
    }
    return `Le prix pour une seule unité (${unit}), sera pré-rempli sur vos factures.`;
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
      error: () => {
        this.saving.set(false);
        this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
      },
    });
  }
}
