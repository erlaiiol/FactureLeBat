import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../../core/services/product.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';

@Component({
  selector: 'app-product-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent],
  templateUrl: './product-form.page.html',
})
export class ProductFormPage {
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

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    unit: ['', Validators.required],
    // Entered as a plain euro amount and converted to cents on submit — the
    // same boundary-conversion convention as the invoice line form.
    priceEuros: [0, [Validators.required, Validators.min(0)]],
    supplierName: [''],
    supplierUrl: ['', Validators.pattern(/^$|^https?:\/\/.+/)],
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
            unit: draft.unit ?? this.form.value.unit ?? '',
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
