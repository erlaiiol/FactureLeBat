import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductProfile } from '../../../core/models/product.model';
import { Unit, UNIT_OPTIONS } from '../../../core/models/unit.model';
import { ProductService } from '../../../core/services/product.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';

// Phase 13.5 "Simplified Inline Product Creation": a minimal essential-
// fields-only creation form (name/unit/price) for the "doesn't exist yet"
// case on the merged catalog/lines screen, with the rest of today's full
// Product form (description, fournisseur/URL, code, quantité de
// conditionnement) collapsed behind "Afficher tout" — never a separate,
// second-class row: whichever path is used produces one ordinary Product,
// fully editable afterwards from "Mes produits" (docs/roadmap.md's
// "autofill, not a lock" rule).
@Component({
  selector: 'app-quick-product-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
  templateUrl: './quick-product-create.component.html',
})
export class QuickProductCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);

  readonly created = output<ProductProfile>();
  readonly cancel = output<void>();

  protected readonly unitOptions = UNIT_OPTIONS;

  protected readonly showAllFields = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    unit: this.fb.nonNullable.control<Unit>('SQUARE_METER', Validators.required),
    priceEuros: [0, [Validators.required, Validators.min(0)]],
    description: [''],
    supplierName: [''],
    supplierUrl: ['', Validators.pattern(/^$|^https?:\/\/.+/)],
    code: [''],
    packagingQuantity: this.fb.control<number | null>(null, Validators.min(0.001)),
  });

  protected toggleAllFields(): void {
    this.showAllFields.set(!this.showAllFields());
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
    this.saving.set(true);
    this.errorMessage.set(null);

    this.productService
      .create({
        name: value.name,
        unit: value.unit,
        priceCents: Math.round(value.priceEuros * 100),
        description: value.description || undefined,
        supplierName: value.supplierName || undefined,
        supplierUrl: value.supplierUrl || undefined,
        code: value.code || undefined,
        packagingQuantity: value.packagingQuantity ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => {
          this.saving.set(false);
          this.created.emit(product);
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set(
            'Erreur lors de la création du produit — vérifiez le code produit s’il y en a un.',
          );
        },
      });
  }
}
