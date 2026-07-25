import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { InvoiceCardDragDirective } from './invoice-card-drag.directive';

// Mirrors the board's 5 columns (Phase 16) — DEVIS is view/download-only
// here (its conversion CTA lives on app-invoice-ghost-card in Non payées,
// decided explicitly with the user), the other 4 are a real, draggable
// FACTURE status.
export type BoardColumn = 'DEVIS' | 'NON_PAYEE' | 'EN_RETARD' | 'PAYEE' | 'ANNULEE';

// One card, reused across every column — same compact-card visual language
// as the client picker (Phase 13.5, invoice-create-customer-step.page.html)
// and this app's other card-based screen. Column-specific action buttons
// per docs/roadmap.md Phase 16's table; only attaches the drag directive
// outside the Devis column (a devis has no draggable status).
@Component({
  selector: 'app-invoice-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CentsToEurosPipe, BadgeComponent, InvoiceCardDragDirective],
  templateUrl: './invoice-board-card.component.html',
})
export class InvoiceBoardCardComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input.required<InvoiceWithTotals>();
  readonly column = input.required<BoardColumn>();

  readonly markPaid = output<void>();
  readonly cancel = output<void>();
  readonly restore = output<void>();
  readonly sendEmail = output<void>();
  readonly dropped = output<string | null>();

  protected readonly draggable = computed(() => this.column() !== 'DEVIS');
  protected readonly overdue = computed(() => this.column() === 'EN_RETARD');

  protected pdfUrl(): string {
    return this.invoiceService.pdfUrl(this.invoice().id);
  }
}
