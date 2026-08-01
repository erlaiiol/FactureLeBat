import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { CustomerSearchResult, CustomerSortBy } from '../../core/models/customer.model';
import { CustomerService } from '../../core/services/customer.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { SkeletonRowsComponent } from '../../shared/components/skeleton-rows.component';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 14.5: sort options shown in the dropdown, in this order.
const SORT_OPTIONS: ReadonlyArray<{ value: CustomerSortBy; label: string }> = [
  { value: 'alphabetique', label: 'Alphabétique' },
  { value: 'derniereFacture', label: 'Dernière facture' },
  { value: 'dernierDevis', label: 'Dernier devis' },
  { value: 'dateCreation', label: 'Date de création' },
];

@Component({
  selector: 'app-customer-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BigButtonComponent,
    SkeletonRowsComponent,
    TourAnchorDirective,
    DatePipe,
  ],
  templateUrl: './customer-list.page.html',
})
export class CustomerListPage {
  private readonly customerService = inject(CustomerService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly customers = signal<CustomerSearchResult[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly search = this.fb.nonNullable.control('');
  protected readonly sortBy = this.fb.nonNullable.control<CustomerSortBy>('alphabetique');
  protected readonly sortOptions = SORT_OPTIONS;

  constructor() {
    combineLatest([
      this.search.valueChanges.pipe(startWith(''), debounceTime(300), distinctUntilChanged()),
      this.sortBy.valueChanges.pipe(startWith(this.sortBy.value)),
    ])
      .pipe(
        switchMap(([term, sortBy]) => this.customerService.getAll(term || undefined, sortBy)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (customers) => {
          this.customers.set(customers);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos clients. Veuillez réessayer.');
        },
      });
  }

  // "Documents": jumps to Mes documents with this client's devis/factures
  // highlighted (see InvoiceBoardPage.highlightedClientId) rather than
  // hard-filtered, so the artisan can still see the rest of the list while
  // spotting this client's rows at a glance.
  protected viewDocuments(customer: CustomerSearchResult): void {
    void this.router.navigate(['/factures'], {
      queryParams: { clientId: customer.id, clientName: customer.name },
    });
  }
}
