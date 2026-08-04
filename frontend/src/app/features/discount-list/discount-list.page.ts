import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { DiscountProfile } from '../../core/models/discount.model';
import { DiscountService } from '../../core/services/discount.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { SkeletonRowsComponent } from '../../shared/components/skeleton-rows.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

@Component({
  selector: 'app-discount-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BigButtonComponent,
    SkeletonRowsComponent,
    CentsToEurosPipe,
  ],
  templateUrl: './discount-list.page.html',
})
export class DiscountListPage {
  private readonly discountService = inject(DiscountService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly discounts = signal<DiscountProfile[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly search = this.fb.nonNullable.control('');

  constructor() {
    this.search.valueChanges
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => this.discountService.getAll(term || undefined)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (discounts) => {
          this.discounts.set(discounts);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos remises. Veuillez réessayer.');
        },
      });
  }
}
