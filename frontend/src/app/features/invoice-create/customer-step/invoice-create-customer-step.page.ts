import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomerProfile } from '../../../core/models/customer.model';
import { AdvancedSettingsComponent } from '../../../shared/components/advanced-settings.component';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { delayedSkeleton } from '../../../shared/utils/delayed-skeleton';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 6/13.5, step 1: card-based client picker. Clicking an existing
// client's card selects it and advances straight to the lignes step — no
// intermediate confirm step (docs/roadmap.md Phase 13.5's flow point 1).
// "+ Nouveau client" reveals today's creation form inline instead, which
// still ends on its own "Suivant" since there's new data to type first.
@Component({
  selector: 'app-invoice-create-customer-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AdvancedSettingsComponent,
    BigButtonComponent,
    FieldHintComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-customer-step.page.html',
})
export class InvoiceCreateCustomerStepPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly selectedCustomerId = signal<string | null>(
    this.draftStore.customer().customerId,
  );

  // Grid is skipped in favor of the create form when a draft is already
  // mid-creation (e.g. back-navigation from the lignes step with freehand,
  // unsaved customer data already typed) — same "never lose what's already
  // there" principle as everywhere else this draft is restored from.
  protected readonly mode = signal<'grid' | 'create'>(
    this.draftStore.customer().customerName.trim().length > 0 ? 'create' : 'grid',
  );

  protected readonly search = signal('');

  // The picker grid starts empty and pops once InvoiceDraftStore's
  // constructor-time getAllCached() resolves (asyncReveal's "content that
  // only exists after an API response" case, same as the standalone
  // customer/product/service list pages) — gate it the same way so a fresh
  // draft doesn't flash straight from "+ Nouveau client" alone to a full
  // grid.
  protected readonly customersLoading = computed(() => !this.draftStore.customersLoaded());
  protected readonly showCustomersSkeleton = delayedSkeleton(this.customersLoading);
  protected readonly skeletonCards = Array.from({ length: 3 });

  protected readonly filteredCustomers = computed(() => {
    const term = this.search().trim().toLowerCase();
    const customers = this.draftStore.customers();
    if (!term) {
      return customers;
    }
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.companyName ?? '').toLowerCase().includes(term),
    );
  });

  protected readonly customerForm = this.fb.nonNullable.group({
    customerName: [this.draftStore.customer().customerName, Validators.required],
    customerAddress: [this.draftStore.customer().customerAddress],
    customerEmail: [this.draftStore.customer().customerEmail],
    customerPhone: [this.draftStore.customer().customerPhone],
    customerSiret: [this.draftStore.customer().customerSiret],
    deliveryAddress: [this.draftStore.customer().deliveryAddress],
    saveAsNewCustomer: [this.draftStore.customer().saveAsNewCustomer],
  });

  constructor() {
    this.customerForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const value = this.customerForm.getRawValue();
      this.draftStore.setCustomer({ ...value, customerId: this.selectedCustomerId() });
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  // Clicking a client card: select it and advance immediately, no
  // intermediate confirm step (docs/roadmap.md Phase 13.5).
  protected pickCustomer(customer: CustomerProfile): void {
    this.resetLinesIfCustomerChanging(customer.id);
    this.selectedCustomerId.set(customer.id);
    this.customerForm.patchValue({
      customerName: customer.name,
      customerAddress: customer.address ?? '',
      customerEmail: customer.email ?? '',
      customerPhone: customer.phone ?? '',
      // Phase 1.1-8: one-shot autofill at pick time, same spirit as the
      // three fields above — freely editable afterward, never re-synced.
      customerSiret: customer.siret ?? '',
      deliveryAddress: customer.address ?? '',
      saveAsNewCustomer: false,
    });
    this.draftStore.setCustomer({
      ...this.customerForm.getRawValue(),
      customerId: customer.id,
    });
    this.router.navigate(['/factures/nouvelle/rapide/lignes']);
  }

  protected startNewCustomer(): void {
    this.resetLinesIfCustomerChanging(null);
    this.selectedCustomerId.set(null);
    this.customerForm.reset({
      customerName: '',
      customerAddress: '',
      customerEmail: '',
      customerPhone: '',
      customerSiret: '',
      deliveryAddress: '',
      saveAsNewCustomer: false,
    });
    this.mode.set('create');
  }

  // Lines/prestations are tied to whichever client the artisan was billing
  // for — switching to a different client (or to a brand-new one) mid-draft
  // means whatever was already added no longer applies, so it's cleared
  // silently rather than carried over onto the new client's invoice. A no-op
  // when there's nothing to lose (fresh draft) or when re-picking the same
  // client that was already selected.
  private resetLinesIfCustomerChanging(nextCustomerId: string | null): void {
    const previousCustomerId = this.draftStore.customer().customerId;
    if (previousCustomerId === nextCustomerId) {
      return;
    }
    if (this.draftStore.lines().length === 0 && this.draftStore.serviceLines().length === 0) {
      return;
    }
    this.draftStore.setLines([]);
    this.draftStore.setServiceLines([]);
  }

  protected backToGrid(): void {
    this.mode.set('grid');
  }

  protected next(): void {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }
    this.draftStore.setCustomer({
      ...this.customerForm.getRawValue(),
      customerId: this.selectedCustomerId(),
    });
    this.router.navigate(['/factures/nouvelle/rapide/lignes']);
  }
}
