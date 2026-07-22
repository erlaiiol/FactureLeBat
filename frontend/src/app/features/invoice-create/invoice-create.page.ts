import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';
import { CompanyProfile } from '../../core/models/company.model';
import { CustomerProfile } from '../../core/models/customer.model';
import {
  CreateInvoiceLineRequest,
  CreateInvoiceServiceLineRequest,
  InvoiceWithTotals,
  RedistributionStrategy,
  ServiceLineVisibility,
  WasteSurcharge,
} from '../../core/models/invoice.model';
import { ServiceProfile } from '../../core/models/service.model';
import { CompanyService } from '../../core/services/company.service';
import { CustomerService } from '../../core/services/customer.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { computeTotalsPreview } from './calculation-preview';
import {
  InvoiceLineFormComponent,
  InvoiceLineFormGroup,
} from './components/invoice-line-form.component';
import {
  InvoiceServiceLineFormComponent,
  InvoiceServiceLineFormGroup,
} from './components/invoice-service-line-form.component';
import { InvoiceTotalsSummaryComponent } from './components/invoice-totals-summary.component';

@Component({
  selector: 'app-invoice-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BigButtonComponent,
    InvoiceLineFormComponent,
    InvoiceServiceLineFormComponent,
    InvoiceTotalsSummaryComponent,
  ],
  templateUrl: './invoice-create.page.html',
})
export class InvoiceCreatePage {
  private readonly fb = inject(FormBuilder);
  private readonly companyService = inject(CompanyService);
  private readonly customerService = inject(CustomerService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly company = signal<CompanyProfile | null>(null);
  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);

  // Saved customers, offered as a one-shot autofill for the (always
  // free-text, always editable) customer fields below — never a lock.
  protected readonly customers = signal<CustomerProfile[]>([]);
  protected readonly selectedCustomerId = signal<string | null>(null);

  protected readonly customerForm = this.fb.nonNullable.group({
    customerName: ['', Validators.required],
    customerAddress: [''],
    customerEmail: [''],
    customerPhone: [''],
    saveAsNewCustomer: [false],
  });

  protected readonly lines = this.fb.array<InvoiceLineFormGroup>([this.createLineGroup()]);

  private readonly linesValue = toSignal(this.lines.valueChanges, {
    initialValue: this.lines.getRawValue(),
  });

  // Phase 5: services added to the invoice, either their own visible line
  // or a hidden amount redistributed into the lines above. Empty by
  // default — most invoices are still just product lines.
  protected readonly services = signal<ServiceProfile[]>([]);
  protected readonly serviceLines = this.fb.array<InvoiceServiceLineFormGroup>([]);

  private readonly serviceLinesValue = toSignal(this.serviceLines.valueChanges, {
    initialValue: this.serviceLines.getRawValue(),
  });

  protected readonly lineLabels = computed(() =>
    this.linesValue().map((line, index) => line.description || `Ligne ${index + 1}`),
  );

  protected readonly vatApplicable = computed(() => this.company()?.legalStatus === 'COMPANY');

  private readonly serviceAmountCents = computed(() =>
    this.serviceLinesValue().reduce((sum, serviceLine) => {
      const cents = Math.round((serviceLine.amountEuros ?? 0) * 100);
      return Number.isFinite(cents) && cents > 0 ? sum + cents : sum;
    }, 0),
  );

  protected readonly totalsPreview = computed(() => {
    const company = this.company();
    const lineInputs = this.linesValue().map((line) => ({
      mode: line.mode ?? 'AREA',
      quantity: line.quantity ?? 0,
      unitPriceCents: Math.round((line.unitPriceEuros ?? 0) * 100),
      wasteSurcharge: line.wasteSurcharge ?? 'NONE',
    }));
    return computeTotalsPreview(
      lineInputs,
      this.vatApplicable(),
      company?.vatRateBasisPoints ?? 0,
      this.serviceAmountCents(),
    );
  });

  constructor() {
    // The backend independently re-loads the company profile when actually
    // creating the invoice, so a failure here only degrades the live total
    // preview (falls back to "no VAT") — it must not block the form.
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (profile) => this.company.set(profile) });

    // Best-effort: if this fails, the "client enregistré" picker is simply
    // empty — free-text entry (the Phase 1 flow) still works either way.
    this.customerService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (customers) => this.customers.set(customers) });

    // Best-effort, same reasoning: an empty "prestation enregistrée" picker
    // still leaves the ad-hoc name/price service-line flow fully usable.
    this.serviceCatalogService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (services) => this.services.set(services) });
  }

  protected onCustomerSelected(customerId: string): void {
    if (!customerId) {
      this.selectedCustomerId.set(null);
      return;
    }
    const customer = this.customers().find((c) => c.id === customerId);
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

  private createLineGroup(): InvoiceLineFormGroup {
    return this.fb.nonNullable.group({
      description: this.fb.nonNullable.control('', Validators.required),
      unit: this.fb.nonNullable.control('', Validators.required),
      mode: this.fb.nonNullable.control<'AREA' | 'UNIT'>('AREA'),
      quantity: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0.001)]),
      unitPriceEuros: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0)]),
      wasteSurcharge: this.fb.nonNullable.control<WasteSurcharge>('NONE'),
    });
  }

  protected addLine(): void {
    this.lines.push(this.createLineGroup());
    this.syncAllServiceLineWeights();
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
      this.syncAllServiceLineWeights();
    }
  }

  private createServiceLineGroup(): InvoiceServiceLineFormGroup {
    const group = this.fb.nonNullable.group({
      serviceId: this.fb.control<string | null>(null),
      name: this.fb.nonNullable.control('', Validators.required),
      description: this.fb.nonNullable.control(''),
      amountEuros: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0)]),
      visibility: this.fb.nonNullable.control<ServiceLineVisibility>('VISIBLE'),
      redistributionStrategy: this.fb.nonNullable.control<RedistributionStrategy>('EQUAL'),
      weights: this.fb.array<FormControl<number>>([]),
    });
    this.syncServiceLineWeights(group);
    return group;
  }

  // Keeps a service line's `weights` FormArray sized to exactly the current
  // number of invoice lines — one weight input per line, in order — so the
  // form is always ready to submit a WEIGHTED redistribution even though the
  // weight inputs are only shown once that strategy is picked (see
  // InvoiceServiceLineFormComponent).
  private syncServiceLineWeights(group: InvoiceServiceLineFormGroup): void {
    const weights = group.controls.weights;
    while (weights.length < this.lines.length) {
      weights.push(this.fb.nonNullable.control(1, [Validators.required, Validators.min(0)]));
    }
    while (weights.length > this.lines.length) {
      weights.removeAt(weights.length - 1);
    }
  }

  private syncAllServiceLineWeights(): void {
    this.serviceLines.controls.forEach((group) => this.syncServiceLineWeights(group));
  }

  protected addServiceLine(): void {
    this.serviceLines.push(this.createServiceLineGroup());
  }

  protected removeServiceLine(index: number): void {
    this.serviceLines.removeAt(index);
  }

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
  }

  protected startNewInvoice(): void {
    this.createdInvoice.set(null);
    this.errorMessage.set(null);
    this.selectedCustomerId.set(null);
    this.customerForm.reset({ saveAsNewCustomer: false });
    while (this.lines.length > 0) {
      this.lines.removeAt(0);
    }
    this.lines.push(this.createLineGroup());
    while (this.serviceLines.length > 0) {
      this.serviceLines.removeAt(0);
    }
  }

  protected submit(): void {
    if (this.creating()) {
      return; // already in flight — ignore a fast double click/tap
    }
    if (this.customerForm.invalid || this.lines.invalid || this.serviceLines.invalid) {
      this.customerForm.markAllAsTouched();
      this.lines.markAllAsTouched();
      this.serviceLines.markAllAsTouched();
      return;
    }

    const customer = this.customerForm.getRawValue();
    const lines: CreateInvoiceLineRequest[] = this.lines.getRawValue().map((line) => ({
      description: line.description,
      unit: line.unit,
      mode: line.mode,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceEuros * 100),
      wasteSurcharge: line.mode === 'AREA' ? line.wasteSurcharge : 'NONE',
    }));

    const serviceLines: CreateInvoiceServiceLineRequest[] = this.serviceLines
      .getRawValue()
      .map((serviceLine) => {
        if (serviceLine.visibility === 'VISIBLE') {
          return {
            serviceId: serviceLine.serviceId ?? undefined,
            name: serviceLine.name,
            description: serviceLine.description || undefined,
            amountCents: Math.round(serviceLine.amountEuros * 100),
            visibility: 'VISIBLE' as const,
          };
        }
        return {
          serviceId: serviceLine.serviceId ?? undefined,
          name: serviceLine.name,
          description: serviceLine.description || undefined,
          amountCents: Math.round(serviceLine.amountEuros * 100),
          visibility: 'REDISTRIBUTED' as const,
          redistributionStrategy: serviceLine.redistributionStrategy,
          weights:
            serviceLine.redistributionStrategy === 'WEIGHTED' ? serviceLine.weights : undefined,
        };
      });

    this.creating.set(true);
    this.errorMessage.set(null);

    const buildInvoiceRequest = (customerId?: string) => ({
      customerName: customer.customerName,
      customerAddress: customer.customerAddress || undefined,
      customerEmail: customer.customerEmail || undefined,
      customerPhone: customer.customerPhone || undefined,
      customerId,
      lines,
      serviceLines: serviceLines.length > 0 ? serviceLines : undefined,
    });

    // "Enregistrer ce client" only applies to freehand entry — if a saved
    // customer was picked, there's nothing new to save.
    const request$ =
      customer.saveAsNewCustomer && !this.selectedCustomerId()
        ? this.customerService
            .create({
              name: customer.customerName,
              address: customer.customerAddress || undefined,
              email: customer.customerEmail || undefined,
              phone: customer.customerPhone || undefined,
            })
            .pipe(
              switchMap((newCustomer) =>
                this.invoiceService.create(buildInvoiceRequest(newCustomer.id)),
              ),
            )
        : this.invoiceService.create(buildInvoiceRequest(this.selectedCustomerId() ?? undefined));

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (invoice) => {
        this.creating.set(false);
        this.createdInvoice.set(invoice);
      },
      error: () => {
        this.creating.set(false);
        this.errorMessage.set('Erreur lors de la création de la facture. Veuillez réessayer.');
      },
    });
  }
}
