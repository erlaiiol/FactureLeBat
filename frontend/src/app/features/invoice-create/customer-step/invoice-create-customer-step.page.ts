import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { FieldHintComponent } from '../../../shared/components/field-hint.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 6, step 1: dedicated customer picker/creation screen. Reads its
// initial values from the shared InvoiceDraftStore (so back-navigation or a
// localStorage-restored draft both work) and writes every change straight
// back to it, so the shell's total/preview always reflect the latest typed
// value — not just what was there at the last "Suivant" click.
@Component({
  selector: 'app-invoice-create-customer-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, BigButtonComponent, FieldHintComponent],
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

  protected readonly customerForm = this.fb.nonNullable.group({
    customerName: [this.draftStore.customer().customerName, Validators.required],
    customerAddress: [this.draftStore.customer().customerAddress],
    customerEmail: [this.draftStore.customer().customerEmail],
    customerPhone: [this.draftStore.customer().customerPhone],
    saveAsNewCustomer: [this.draftStore.customer().saveAsNewCustomer],
  });

  constructor() {
    this.customerForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const value = this.customerForm.getRawValue();
      this.draftStore.setCustomer({ ...value, customerId: this.selectedCustomerId() });
    });
  }

  protected onCustomerSelected(customerId: string): void {
    if (!customerId) {
      this.selectedCustomerId.set(null);
      return;
    }
    const customer = this.draftStore.customers().find((c) => c.id === customerId);
    if (!customer) {
      return;
    }
    this.selectedCustomerId.set(customer.id);
    this.customerForm.patchValue({
      customerName: customer.name,
      customerAddress: customer.address ?? '',
      customerEmail: customer.email ?? '',
      customerPhone: customer.phone ?? '',
      saveAsNewCustomer: false,
    });
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
    this.router.navigate(['/factures/nouvelle/lignes']);
  }
}
