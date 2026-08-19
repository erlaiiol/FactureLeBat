import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DiscountType } from '../../core/models/discount.model';
import { DiscountService } from '../../core/services/discount.service';
import { ToastService } from '../../core/services/toast.service';
import { AdvancedSettingsComponent } from '../../shared/components/advanced-settings.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { CatalogFolderMultiSelectComponent } from '../../shared/components/catalog-folder-multi-select.component';
import { FieldHintComponent } from '../../shared/components/field-hint.component';
import { catalogLimitMessage } from '../../shared/utils/plan-error.util';

@Component({
  selector: 'app-discount-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AdvancedSettingsComponent,
    BigButtonComponent,
    CatalogFolderMultiSelectComponent,
    FieldHintComponent,
  ],
  templateUrl: './discount-form.page.html',
})
export class DiscountFormPage {
  private readonly discountService = inject(DiscountService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly discountId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditing = this.discountId !== null;

  protected readonly loading = signal(this.isEditing);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Phase 30: catalog-size cap reached (Essentiel/Pro, products + services +
  // discounts combined) — see ServiceFormPage's equivalent signal.
  protected readonly catalogLimitReached = signal(false);

  // Deliberately a shorter form than ProductFormPage/ServiceFormPage: name +
  // type + value only — no code/description/activityCategory, matching what
  // the quick-mode card itself asks for.
  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    discountType: this.fb.nonNullable.control<DiscountType>('FIXED'),
    fixedAmountEuros: [0, [Validators.min(0)]],
    // Entered as a plain percentage (e.g. 10 for 10%) and converted to basis
    // points on submit — same boundary-conversion convention as ServiceFormPage.
    percentage: [0, [Validators.min(0.01), Validators.max(100)]],
  });

  // Phase 1.1-2: zero, one, or several CatalogFolder ids — local,
  // uncommitted signal, same pattern as ProductFormPage.selectedFolderIds.
  protected readonly selectedFolderIds = signal<string[]>([]);

  protected isPercentageMode(): boolean {
    return this.form.controls.discountType.value === 'PERCENTAGE';
  }

  protected setDiscountType(type: DiscountType): void {
    this.form.controls.discountType.setValue(type);
  }

  constructor() {
    if (this.discountId) {
      this.discountService
        .getById(this.discountId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (discount) => {
            this.loading.set(false);
            this.form.patchValue({
              name: discount.name,
              discountType: discount.discountType,
              fixedAmountEuros:
                discount.fixedAmountCents != null ? discount.fixedAmountCents / 100 : 0,
              percentage:
                discount.percentageBasisPoints != null ? discount.percentageBasisPoints / 100 : 0,
            });
            this.selectedFolderIds.set(discount.folders.map((folder) => folder.id));
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set('Impossible de charger cette remise.');
          },
        });
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return; // already in flight — ignore a fast double click/tap
    }
    const valueControl =
      this.form.controls.discountType.value === 'FIXED'
        ? this.form.controls.fixedAmountEuros
        : this.form.controls.percentage;
    if (this.form.controls.name.invalid || valueControl.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      name: value.name,
      discountType: value.discountType,
      fixedAmountCents:
        value.discountType === 'FIXED' ? Math.round(value.fixedAmountEuros * 100) : undefined,
      percentageBasisPoints:
        value.discountType === 'PERCENTAGE' ? Math.round(value.percentage * 100) : undefined,
      folderIds: this.selectedFolderIds(),
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.catalogLimitReached.set(false);

    const request = this.discountId
      ? this.discountService.update(this.discountId, payload)
      : this.discountService.create(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toastService.success(this.isEditing ? 'Remise modifiée.' : 'Remise enregistrée.');
        void this.router.navigate(['/remises']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        const limitMessage = catalogLimitMessage(error);
        if (limitMessage) {
          this.catalogLimitReached.set(true);
          this.errorMessage.set(limitMessage);
        } else {
          this.errorMessage.set('Erreur lors de l’enregistrement. Veuillez réessayer.');
        }
      },
    });
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }
}
