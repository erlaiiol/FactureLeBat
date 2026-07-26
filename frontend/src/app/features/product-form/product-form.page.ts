import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ACTIVITY_CATEGORY_OPTIONS, ActivityCategory } from '../../core/models/report.model';
import {
  Unit,
  UNIT_LABELS,
  UNIT_OPTIONS,
  UNIT_PRICE_BUTTON_LABELS,
} from '../../core/models/unit.model';
import { ProductService } from '../../core/services/product.service';
import { ToastService } from '../../core/services/toast.service';
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
  protected readonly activityCategoryOptions = ACTIVITY_CATEGORY_OPTIONS;

  private readonly productService = inject(ProductService);
  private readonly toastService = inject(ToastService);
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

  // UX follow-up: an artisan describes a box the way it's physically
  // labeled — "8 planches" — not the way pricing math would derive it. Both
  // packaging fields are entered directly (no more deducing content from
  // two prices, which drifted from reality whenever a supplier's prices
  // didn't divide evenly). This item-count field is local, UI-only
  // convenience — never sent to the backend; only packagingQuantity (the
  // real content, in the product's own unit) is ever persisted.
  protected readonly packagingItemCount = signal<number | null>(null);

  protected unitPriceButtonLabel(): string {
    return UNIT_PRICE_BUTTON_LABELS[this.form.controls.unit.value];
  }

  protected onPackagingItemCountInput(rawValue: string): void {
    const count = Number(rawValue);
    this.packagingItemCount.set(Number.isFinite(count) && count > 0 ? count : null);
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
    // Phase 17: artisan-set, left unset by default — no automatic detection
    // (see docs/roadmap.md Phase 17's non-goals).
    activityCategory: this.fb.control<ActivityCategory | null>(null),
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
              activityCategory: product.activityCategory,
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
      activityCategory: value.activityCategory ?? undefined,
    };

    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.productId
      ? this.productService.update(this.productId, payload)
      : this.productService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toastService.success(this.isEditing ? 'Produit modifié.' : 'Produit enregistré.');
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
