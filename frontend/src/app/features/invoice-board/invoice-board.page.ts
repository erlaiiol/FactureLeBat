import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { InvoiceShareService } from '../../core/services/invoice-share.service';
import { ToastService } from '../../core/services/toast.service';
import { BoardColumn, InvoiceBoardCardComponent } from './invoice-board-card.component';
import { InvoiceDueDateModalComponent } from './invoice-due-date-modal.component';
import { isOverdue } from './invoice-status.util';
import { SendInvoiceEmailModalComponent } from '../../shared/components/send-invoice-email-modal.component';
import { BadgeComponent } from '../../shared/components/badge.component';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 16: replaces the old flat "Mes factures" list entirely (decided
// explicitly with the user — a mobile-first management board, not a
// list/board toggle) with a 5-column Kanban: Devis, Non payées, En retard,
// Payées, Annulées. A devis has no payment status, so it only ever lives in
// the Devis column — its own card carries the conversion CTA directly,
// never a stand-in card in another column. "En retard" is computed here,
// never persisted — see invoice-status.util's isOverdue.
@Component({
  selector: 'app-invoice-board-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InvoiceBoardCardComponent,
    InvoiceDueDateModalComponent,
    SendInvoiceEmailModalComponent,
    BadgeComponent,
  ],
  templateUrl: './invoice-board.page.html',
})
export class InvoiceBoardPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceShareService = inject(InvoiceShareService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invoices = signal<InvoiceWithTotals[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly unpaidOnly = signal(false);

  protected readonly emailModalInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly sharingInvoiceId = signal<string | null>(null);
  // Which facture is waiting on the due-date modal, and where it's headed —
  // 'NON_PAYEE' whether the move came from a drag or the "Restaurer" button,
  // both funnel through moveToNonPayee below.
  protected readonly dueDateModalInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly convertingDevisId = signal<string | null>(null);

  private readonly filtered = computed(() => {
    const search = this.search().trim().toLowerCase();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.invoices().filter((invoice) => {
      if (search && !invoice.customerName.toLowerCase().includes(search)) {
        return false;
      }
      const date = invoice.date.slice(0, 10);
      if (from && date < from) {
        return false;
      }
      if (to && date > to) {
        return false;
      }
      return true;
    });
  });

  protected readonly devis = computed(() =>
    this.filtered().filter((invoice) => invoice.documentType === 'DEVIS'),
  );
  protected readonly nonPayees = computed(() =>
    this.filtered().filter(
      (invoice) =>
        invoice.documentType === 'FACTURE' && invoice.status === 'NON_PAYEE' && !isOverdue(invoice),
    ),
  );
  protected readonly enRetard = computed(() =>
    this.filtered().filter((invoice) => invoice.documentType === 'FACTURE' && isOverdue(invoice)),
  );
  protected readonly payees = computed(() =>
    this.filtered().filter(
      (invoice) => invoice.documentType === 'FACTURE' && invoice.status === 'PAYEE',
    ),
  );
  protected readonly annulees = computed(() =>
    this.filtered().filter(
      (invoice) => invoice.documentType === 'FACTURE' && invoice.status === 'ANNULEE',
    ),
  );

  // All 5 columns are always rendered (even empty, with a placeholder
  // message) — decided explicitly with the user, who wants the whole board
  // shape visible at a glance rather than columns popping in/out. "Non
  // payées uniquement" instead reorders the board via CSS `order` (below)
  // so the two "problem" columns (En retard, Non payées) lead, without
  // hiding Devis/Payées/Annulées.
  protected readonly devisOrder = computed(() => (this.unpaidOnly() ? 3 : 1));
  protected readonly nonPayeeOrder = computed(() => (this.unpaidOnly() ? 2 : 2));
  protected readonly enRetardOrder = computed(() => (this.unpaidOnly() ? 1 : 3));
  protected readonly payeeOrder = 4;
  protected readonly annuleeOrder = 5;

  constructor() {
    this.invoiceService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoices) => {
          this.invoices.set(invoices);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos factures. Veuillez réessayer.');
        },
      });
  }

  protected onSearchInput(value: string): void {
    this.search.set(value);
  }

  protected onDateFromInput(value: string): void {
    this.dateFrom.set(value);
  }

  protected onDateToInput(value: string): void {
    this.dateTo.set(value);
  }

  protected toggleUnpaidOnly(): void {
    this.unpaidOnly.update((value) => !value);
  }

  protected unpaidToggleClasses(): string {
    return this.unpaidOnly()
      ? 'bg-primary text-primary-fg hover:brightness-90'
      : 'border border-line text-ink-soft hover:bg-secondary-subtle';
  }

  protected onCardDropped(invoice: InvoiceWithTotals, target: string | null): void {
    if (!target || target === invoice.status) {
      return;
    }
    if (target === 'NON_PAYEE') {
      this.moveToNonPayee(invoice);
    } else if (target === 'PAYEE') {
      this.markPaid(invoice);
    } else if (target === 'ANNULEE') {
      this.cancelInvoice(invoice);
    }
  }

  protected markPaid(invoice: InvoiceWithTotals): void {
    this.updateStatus(invoice.id, { status: 'PAYEE' }, 'Facture marquée payée.');
  }

  protected cancelInvoice(invoice: InvoiceWithTotals): void {
    this.updateStatus(invoice.id, { status: 'ANNULEE' }, 'Facture annulée.');
  }

  // Entry point for both a drag into "Non payées" and the "Restaurer"
  // button — opens the due-date modal only if none is set yet (skippable),
  // per docs/roadmap.md Phase 16.
  protected moveToNonPayee(invoice: InvoiceWithTotals): void {
    if (invoice.dueDate) {
      this.updateStatus(invoice.id, { status: 'NON_PAYEE' }, 'Facture déplacée vers Non payées.');
      return;
    }
    this.dueDateModalInvoice.set(invoice);
  }

  protected onDueDateConfirmed(dueDate: string): void {
    const invoice = this.dueDateModalInvoice();
    if (!invoice) {
      return;
    }
    this.dueDateModalInvoice.set(null);
    this.updateStatus(
      invoice.id,
      { status: 'NON_PAYEE', dueDate },
      'Facture déplacée vers Non payées.',
    );
  }

  protected onDueDateSkipped(): void {
    const invoice = this.dueDateModalInvoice();
    if (!invoice) {
      return;
    }
    this.dueDateModalInvoice.set(null);
    this.updateStatus(invoice.id, { status: 'NON_PAYEE' }, 'Facture déplacée vers Non payées.');
  }

  private updateStatus(
    id: string,
    request: { status: 'NON_PAYEE' | 'PAYEE' | 'ANNULEE'; dueDate?: string },
    successMessage: string,
  ): void {
    this.invoiceService
      .updateStatus(id, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.invoices.update((invoices) =>
            invoices.map((invoice) => (invoice.id === updated.id ? updated : invoice)),
          );
          this.toastService.success(successMessage);
        },
        error: () => {
          this.errorMessage.set('Impossible de mettre à jour cette facture pour le moment.');
        },
      });
  }

  protected convertDevis(devis: InvoiceWithTotals): void {
    if (this.convertingDevisId()) {
      return;
    }
    this.convertingDevisId.set(devis.id);
    this.errorMessage.set(null);
    this.invoiceService
      .convertToFacture(devis.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (facture) => {
          this.convertingDevisId.set(null);
          this.invoices.update((invoices) => [
            facture,
            ...invoices.map((invoice) =>
              invoice.id === devis.id
                ? { ...invoice, convertedToFacture: { id: facture.id, number: facture.number } }
                : invoice,
            ),
          ]);
          this.toastService.success(`Devis converti en facture ${facture.number}.`);
        },
        error: () => {
          this.convertingDevisId.set(null);
          this.errorMessage.set('Impossible de créer la facture pour le moment.');
        },
      });
  }

  protected openEmailModal(invoice: InvoiceWithTotals): void {
    this.emailModalInvoice.set(invoice);
  }

  protected async onShare(invoice: InvoiceWithTotals): Promise<void> {
    if (this.sharingInvoiceId()) {
      return;
    }
    this.sharingInvoiceId.set(invoice.id);
    try {
      const outcome = await this.invoiceShareService.share(invoice);
      if (outcome === 'compose-email') {
        this.openEmailModal(invoice);
      }
    } catch {
      this.toastService.error('Impossible de partager ce document pour le moment.');
    } finally {
      this.sharingInvoiceId.set(null);
    }
  }

  protected closeEmailModal(): void {
    this.emailModalInvoice.set(null);
  }

  protected onEmailSent(updated: InvoiceWithTotals): void {
    this.invoices.update((invoices) =>
      invoices.map((invoice) => (invoice.id === updated.id ? updated : invoice)),
    );
    this.emailModalInvoice.set(null);
    this.toastService.success('Email envoyé au client.');
  }

  protected columnOf(invoice: InvoiceWithTotals): BoardColumn {
    if (invoice.documentType === 'DEVIS') {
      return 'DEVIS';
    }
    if (invoice.status === 'PAYEE') {
      return 'PAYEE';
    }
    if (invoice.status === 'ANNULEE') {
      return 'ANNULEE';
    }
    return isOverdue(invoice) ? 'EN_RETARD' : 'NON_PAYEE';
  }
}
