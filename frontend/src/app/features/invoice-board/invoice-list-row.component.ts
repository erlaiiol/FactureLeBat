import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { isOverdue } from './invoice-status.util';

// Phase 26: a real <tr> — every document (devis or facture) is always its
// own top-level row here now, including a facture born from converting a
// devis (see InvoiceBoardPage.rows) — a facture issued days after its devis
// must stay findable by its own date/search, not hidden inside a dropdown
// only reachable by remembering which devis it came from. A devis instead
// shows which facture it's attached to as a small inline link
// (attachedFactureNumber); clicking it toggles `highlighted` on both rows
// (see InvoiceBoardPage.highlightedPair) so the artisan can see, at a
// glance, that the row here and the standalone row elsewhere in the list
// are the same document — see docs/design-system.md's `info` semantic
// color for "these are linked, not a warning" the highlight tint.
// `host: display: contents` removes this component's own host element from
// the table's box tree entirely, so the <tr> its template renders becomes a
// direct, real row of the parent <tbody> — the only way to keep this a
// component (reusable, one file, one responsibility per
// docs/development-rules.md) while still emitting valid table markup;
// without it the browser wouldn't render <tr> as a table row at all, since
// <app-invoice-list-row> isn't a table-context element.
// A FACTURE row's status is changed through a small menu (statusMenuOpen),
// never a fixed cycle — "En retard" is computed (see isOverdue), so it's
// never one of the menu's own choices, only ever a badge state layered on
// top of NON_PAYEE.
@Component({
  selector: 'app-invoice-list-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  imports: [DatePipe, CentsToEurosPipe, BadgeComponent],
  templateUrl: './invoice-list-row.component.html',
})
export class InvoiceListRowComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input.required<InvoiceWithTotals>();
  // Devis-only: the number of the facture it was converted into, if any —
  // null for a facture-less devis and for every facture row (a facture
  // never shows its own origin here, only the devis side links forward).
  readonly attachedFactureNumber = input<string | null>(null);
  // True while this row is part of the currently-toggled devis/facture
  // pair (see InvoiceBoardPage.highlightedPair) — applies the same tint to
  // both rows regardless of how far apart they land in the sorted list.
  readonly highlighted = input(false);
  readonly converting = input(false);
  readonly sharing = input(false);
  // Facture-only: whether the status-change menu is open for this row.
  readonly statusMenuOpen = input(false);

  readonly convertToFacture = output<void>();
  readonly createFromDevis = output<void>();
  readonly toggleHighlight = output<void>();
  readonly toggleStatusMenu = output<void>();
  readonly setPaid = output<void>();
  readonly setCancelled = output<void>();
  readonly setNonPayee = output<void>();
  readonly share = output<void>();

  protected readonly isDevis = computed(() => this.invoice().documentType === 'DEVIS');
  protected readonly overdue = computed(() => !this.isDevis() && isOverdue(this.invoice()));

  protected readonly statusLabel = computed(() => {
    if (this.overdue()) {
      return 'En retard';
    }
    switch (this.invoice().status) {
      case 'PAYEE':
        return 'Payée';
      case 'ANNULEE':
        return 'Annulée';
      default:
        return 'Non payée';
    }
  });

  protected readonly statusVariant = computed<'warning' | 'danger' | 'success' | 'secondary'>(
    () => {
      if (this.overdue()) {
        return 'danger';
      }
      switch (this.invoice().status) {
        case 'PAYEE':
          return 'success';
        case 'ANNULEE':
          return 'secondary';
        default:
          return 'warning';
      }
    },
  );

  protected pdfUrl(): string {
    return this.invoiceService.pdfUrl(this.invoice().id);
  }

  // Phase 24: the status menu is `position: fixed` (viewport-relative,
  // computed here) rather than `absolute` off a positioned ancestor — the
  // table sits in a horizontally-scrollable container (narrow viewports),
  // and an `overflow-x` container implicitly clips `overflow-y` too, which
  // would silently cut off the menu for any row near the bottom of the
  // list. `fixed` escapes that clipping entirely.
  protected readonly menuPosition = signal<{ top: number; left: number } | null>(null);

  protected onStatusBadgeClick(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    this.menuPosition.set({ top: rect.bottom + 4, left: rect.left });
    this.toggleStatusMenu.emit();
  }
}
