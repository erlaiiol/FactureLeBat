import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, TimeoutError } from 'rxjs';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { InvoiceShareService } from '../../core/services/invoice-share.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { IconCalendarComponent } from '../../shared/components/icon-calendar.component';
import { IconChevronDownComponent } from '../../shared/components/icon-chevron-down.component';
import { IconCloseComponent } from '../../shared/components/icon-close.component';
import { CreateDevisModalComponent } from './create-devis-modal.component';
import { InvoiceDueDateModalComponent } from './invoice-due-date-modal.component';
import { InvoiceListRowComponent } from './invoice-list-row.component';
import { InvoicePreviewModalComponent } from './invoice-preview-modal.component';
import { SendInvoiceEmailModalComponent } from '../../shared/components/send-invoice-email-modal.component';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';
import { isOverdue } from './invoice-status.util';

// Phase 24: which column the table is currently sorted by — a Finder/
// Explorer-style sortable-header list. Statut isn't sortable (see
// StatusFilter below, its header cycles a filter instead) — everything
// else is a plain value compare.
type SortColumn = 'date' | 'number' | 'customerName';

// One comparator per sortable column — always ascending, `rows` above
// flips the sign for 'desc'. Ties fall back to the invoice's own date
// (newest first) so same-name groups still read chronologically.
const SORT_COMPARATORS: Record<SortColumn, (a: InvoiceWithTotals, b: InvoiceWithTotals) => number> =
  {
    date: (a, b) => a.date.localeCompare(b.date),
    // Phase 27: `numeric: true` reads embedded digit runs as numbers (so
    // "F-9" sorts before "F-10") — load-bearing now that an artisan can type
    // a free-form custom number, no longer always the same fixed-width
    // zero-padded shape a plain lexicographic compare could rely on.
    number: (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }),
    customerName: (a, b) =>
      a.customerName.localeCompare(b.customerName) || b.date.localeCompare(a.date),
  };

// Phase 25: the "Statut" header itself is the filter control — clicking it
// cycles through this fixed sequence rather than opening a separate picker.
// 'ALL' is the resting state (header shows the plain "Statut" label, every
// document visible, devis grouped with their attached facture); every other
// value scopes the list to just that one payment state — a devis is never a
// member of the 4 payment states, so it (and the whole disclosure/nesting
// mechanism) simply disappears from view while a filter is active, rather
// than needing its own dedicated rule to hide it.
type StatusFilter = 'ALL' | 'PAYEE' | 'NON_PAYEE' | 'ANNULEE' | 'EN_RETARD';
const STATUS_FILTER_CYCLE: readonly StatusFilter[] = [
  'ALL',
  'PAYEE',
  'NON_PAYEE',
  'ANNULEE',
  'EN_RETARD',
];

function matchesStatusFilter(invoice: InvoiceWithTotals, filter: StatusFilter): boolean {
  if (filter === 'ALL') {
    return true;
  }
  if (invoice.documentType === 'DEVIS') {
    return false;
  }
  switch (filter) {
    case 'PAYEE':
      return invoice.status === 'PAYEE';
    case 'ANNULEE':
      return invoice.status === 'ANNULEE';
    case 'EN_RETARD':
      return isOverdue(invoice);
    case 'NON_PAYEE':
      return invoice.status === 'NON_PAYEE' && !isOverdue(invoice);
  }
}

// Phase 23: replaces the Phase 16 5-column Kanban with a single sortable
// list — decided explicitly with the user, who found the board's column
// layout unclear about what to do next with a given document, then (Phase
// 24) asked for it to read like a real Finder/Explorer-style file list
// (sortable column headers, hover-highlighted rows) rather than stacked
// cards. Phase 25: the "Statut" header is itself a filter, not a sort — it
// cycles ALL/Payée/Non payée/Annulée/En retard on click and shows whichever
// is currently active as its own label (see StatusFilter/cycleStatusFilter
// below), replacing the old standalone "Non payées uniquement" toggle.
// Phase 26: a facture born from converting a devis is always its own
// top-level row here, exactly like any other document — it must stay
// findable by its own date/search even if it was issued days after its
// devis, which a "only reachable by expanding the right devis" design
// couldn't support. The devis instead shows a small "→ Facture X" link
// (see attachedFactureOf/highlightedPair below); clicking it highlights
// both rows in the same tint so the artisan can see they're the same
// document without them needing to sit next to each other in the sort
// order. "En retard" stays computed, never persisted — see
// invoice-status.util's isOverdue (used inside InvoiceListRowComponent and
// matchesStatusFilter above).
@Component({
  selector: 'app-invoice-board-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InvoiceListRowComponent,
    InvoiceDueDateModalComponent,
    CreateDevisModalComponent,
    InvoicePreviewModalComponent,
    SendInvoiceEmailModalComponent,
    IconChevronDownComponent,
    IconCloseComponent,
    IconCalendarComponent,
    BadgeComponent,
  ],
  templateUrl: './invoice-board.page.html',
})
export class InvoiceBoardPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceShareService = inject(InvoiceShareService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Phase 24: the reflow-retrigger technique App.replayPageEnterAnimation
  // already uses for route changes — replayed whenever the sort changes, so
  // re-ordering reads as a deliberate refresh (asyncReveal's fade-up-from-
  // above) instead of rows silently jumping to new positions. Anchored on
  // the table's wrapping <div>, not the <tbody> itself: `anim-preview-in`
  // animates `transform`, and transforming a table-row-group is enough for
  // Chrome/Safari to botch that table's column-width layout until something
  // else forces a reflow (e.g. hovering a row) — columns would render
  // squashed/misaligned on every sort and on first load until then.
  @ViewChild('tbodyRef') private readonly tbodyRef?: ElementRef<HTMLElement>;

  protected readonly invoices = signal<InvoiceWithTotals[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');

  protected readonly emailModalInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly sharingInvoiceId = signal<string | null>(null);
  // Which document's preview modal is open — opened by clicking anywhere on
  // its row (see InvoiceListRowComponent.rowClick); combines the PDF preview
  // and the "..." actions into one place that's always fully on-screen, no
  // horizontal table scroll required to reach "Partager" on a phone.
  protected readonly previewInvoice = signal<InvoiceWithTotals | null>(null);
  // Object URL for the preview's iframe — see openPreview/closePreview,
  // which own its fetch and revocation.
  protected readonly previewPdfUrl = signal<string | null>(null);
  private previewPdfSubscription?: Subscription;
  // Which facture is waiting on the due-date modal — same "Non payée" entry
  // point whether it came from the status menu on a fresh NON_PAYEE move or
  // from restoring an ANNULEE one, both funnel through moveToNonPayee below.
  protected readonly dueDateModalInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly convertingDevisId = signal<string | null>(null);
  // Which facture is waiting on the "Créer un devis" (retroactive) modal —
  // see openCreateDevisModal/onDevisCreated below.
  protected readonly createDevisModalInvoice = signal<InvoiceWithTotals | null>(null);

  // Phase 26: the devis/facture pair currently highlighted (see
  // attachedFactureOf/toggleHighlight/isHighlighted below) — at most one
  // pair at a time, cleared by clicking the same devis's link again.
  protected readonly highlightedPair = signal<{ devisId: string; factureId: string } | null>(null);
  // Répertoire entry point: CustomerListPage/ProductListPage/ServiceListPage/
  // DiscountListPage's "Documents" button navigates here with a
  // ?clientId=&clientName= (or productId/serviceId/discountId) query param —
  // scopes the list to that entry's own devis/factures, same as search/
  // dateFrom/dateTo below (see `filtered`), so it stays useful once an
  // artisan has enough documents that a plain highlight would get lost in
  // the list. Combines with search/date/sort like any other filter and only
  // clears via clearRepertoryFilter (the chip's close button next to the
  // date filters). At most one répertoire filter at a time — there is only
  // ever one entry point navigated from.
  protected readonly repertoryFilter = signal<{
    kind: 'client' | 'product' | 'service' | 'discount';
    id: string;
    name: string | null;
  } | null>(null);
  // Phase 23: which single facture row's status menu is open — at most one
  // at a time.
  protected readonly statusMenuInvoiceId = signal<string | null>(null);
  // Which single row's actions ("...") dropdown is open — at most one at a
  // time, same convention as statusMenuInvoiceId above.
  protected readonly actionsMenuInvoiceId = signal<string | null>(null);

  // Phase 24: sortable column headers — defaults to newest-first, the same
  // ordering the API itself already returns.
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<'asc' | 'desc'>('desc');
  // Phase 25: the "Statut" header's own filter state — see StatusFilter above.
  protected readonly statusFilter = signal<StatusFilter>('ALL');

  private readonly filtered = computed(() => {
    const search = this.search().trim().toLowerCase();
    const from = this.dateFrom();
    const to = this.dateTo();
    const repertoryFilter = this.repertoryFilter();
    return this.invoices().filter((invoice) => {
      if (repertoryFilter && !this.matchesRepertoryFilter(invoice, repertoryFilter)) {
        return false;
      }
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

  // Phase 26: every document is always its own top-level row, devis and
  // facture alike — see the class doc comment for why a converted facture
  // is never excluded/nested anymore. Phase 24: sorted by whichever column
  // header was last clicked.
  protected readonly rows = computed(() => {
    const filter = this.statusFilter();
    const column = this.sortColumn();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const compare = SORT_COMPARATORS[column];
    const scoped =
      filter === 'ALL'
        ? this.filtered()
        : this.filtered().filter((invoice) => matchesStatusFilter(invoice, filter));
    return scoped.sort((a, b) => compare(a, b) * direction);
  });

  private readonly invoicesById = computed(
    () => new Map(this.invoices().map((invoice) => [invoice.id, invoice])),
  );

  protected attachedFactureOf(devis: InvoiceWithTotals): InvoiceWithTotals | null {
    const link = devis.convertedToFacture;
    return link ? (this.invoicesById().get(link.id) ?? null) : null;
  }

  // Facture-only counterpart of attachedFactureOf above — the devis
  // retroactively created from it, if any (see InvoiceService.convertToDevis).
  protected attachedDevisOf(facture: InvoiceWithTotals): InvoiceWithTotals | null {
    const link = facture.retroactiveDevis;
    return link ? (this.invoicesById().get(link.id) ?? null) : null;
  }

  protected isHighlighted(invoice: InvoiceWithTotals): boolean {
    const pair = this.highlightedPair();
    return pair !== null && (pair.devisId === invoice.id || pair.factureId === invoice.id);
  }

  // No live FK ties a devis/facture back to its lines' catalog Products —
  // see schema.prisma's comment on InvoiceLine.productId, which does exist,
  // so this only reads lines/serviceLines/discountLines rather than a
  // top-level id the way the 'client' branch reads customerId directly.
  private matchesRepertoryFilter(
    invoice: InvoiceWithTotals,
    filter: { kind: 'client' | 'product' | 'service' | 'discount'; id: string },
  ): boolean {
    switch (filter.kind) {
      case 'client':
        return invoice.customerId === filter.id;
      case 'product':
        return invoice.lines.some((line) => line.productId === filter.id);
      case 'service':
        return invoice.serviceLines.some((serviceLine) => serviceLine.serviceId === filter.id);
      case 'discount':
        return invoice.discountLines.some((discountLine) => discountLine.discountId === filter.id);
    }
  }

  // The chip next to the date filters — the only way to remove the
  // répertoire filter once it's set, same as clearing search/dateFrom/
  // dateTo would.
  protected clearRepertoryFilter(): void {
    this.repertoryFilter.set(null);
  }

  protected repertoryFilterLabel(): string {
    const filter = this.repertoryFilter();
    if (!filter) {
      return '';
    }
    const kindLabels: Record<typeof filter.kind, string> = {
      client: 'Client',
      product: 'Produit',
      service: 'Prestation',
      discount: 'Remise',
    };
    return filter.name
      ? `${kindLabels[filter.kind]} : ${filter.name}`
      : `Filtré par ${kindLabels[filter.kind].toLowerCase()}`;
  }

  // Phase 26: toggles the shared highlight for a devis and the facture it
  // was converted into, and scrolls that facture's row into view — the two
  // can land far apart in the sorted list (different dates), so a plain
  // color cue alone might not be visible without also bringing it on
  // screen. Clicking the same devis's link again clears the highlight.
  protected toggleHighlight(item: InvoiceWithTotals): void {
    const isDevisItem = item.documentType === 'DEVIS';
    const linked = isDevisItem ? this.attachedFactureOf(item) : this.attachedDevisOf(item);
    if (!linked) {
      return;
    }
    const current = this.highlightedPair();
    if (current?.devisId === item.id || current?.factureId === item.id) {
      this.highlightedPair.set(null);
      return;
    }
    this.highlightedPair.set(
      isDevisItem
        ? { devisId: item.id, factureId: linked.id }
        : { devisId: linked.id, factureId: item.id },
    );
    this.scrollRowIntoView(linked.id);
  }

  private scrollRowIntoView(invoiceId: string): void {
    document
      .querySelector(`[data-invoice-row-id="${invoiceId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected isStatusMenuOpen(invoiceId: string): boolean {
    return this.statusMenuInvoiceId() === invoiceId;
  }

  protected toggleStatusMenu(invoiceId: string): void {
    this.actionsMenuInvoiceId.set(null);
    this.statusMenuInvoiceId.update((current) => (current === invoiceId ? null : invoiceId));
  }

  private closeStatusMenu(): void {
    this.statusMenuInvoiceId.set(null);
  }

  protected isActionsMenuOpen(invoiceId: string): boolean {
    return this.actionsMenuInvoiceId() === invoiceId;
  }

  // Same single-menu-at-a-time convention as toggleStatusMenu above — the
  // two dropdowns are visually independent triggers but should never both
  // be open at once for the same row (or two different rows).
  protected toggleActionsMenu(invoiceId: string): void {
    this.statusMenuInvoiceId.set(null);
    this.actionsMenuInvoiceId.update((current) => (current === invoiceId ? null : invoiceId));
  }

  constructor() {
    const queryParams = this.route.snapshot.queryParamMap;
    const repertoryParams: { kind: 'client' | 'product' | 'service' | 'discount' }[] = [
      { kind: 'client' },
      { kind: 'product' },
      { kind: 'service' },
      { kind: 'discount' },
    ];
    for (const { kind } of repertoryParams) {
      const id = queryParams.get(`${kind}Id`);
      if (id) {
        this.repertoryFilter.set({ kind, id, name: queryParams.get(`${kind}Name`) });
        break;
      }
    }

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

  // Phase 25: the "Statut" header's click handler — cycles ALL -> Payée ->
  // Non payée -> Annulée -> En retard -> back to ALL, replaying the same
  // reflow-retrigger reveal as a sort change since the visible row set just
  // changed the same way.
  protected cycleStatusFilter(): void {
    const currentIndex = STATUS_FILTER_CYCLE.indexOf(this.statusFilter());
    this.statusFilter.set(STATUS_FILTER_CYCLE[(currentIndex + 1) % STATUS_FILTER_CYCLE.length]);
    this.replaySortAnimation();
  }

  protected statusFilterLabel(): string {
    switch (this.statusFilter()) {
      case 'PAYEE':
        return 'Payée';
      case 'NON_PAYEE':
        return 'Non payée';
      case 'ANNULEE':
        return 'Annulée';
      case 'EN_RETARD':
        return 'En retard';
      default:
        return 'Statut';
    }
  }

  protected statusFilterVariant(): 'warning' | 'danger' | 'success' | 'secondary' {
    switch (this.statusFilter()) {
      case 'PAYEE':
        return 'success';
      case 'ANNULEE':
        return 'secondary';
      case 'EN_RETARD':
        return 'danger';
      default:
        return 'warning';
    }
  }

  // Phase 24: clicking the active column's header flips direction; clicking
  // a different column switches to it, always starting ascending — same
  // convention as Finder/Explorer's own sortable list headers.
  protected sortBy(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.replaySortAnimation();
  }

  protected sortIndicator(column: SortColumn): 'asc' | 'desc' | null {
    return this.sortColumn() === column ? this.sortDirection() : null;
  }

  // Same reflow-retrigger idiom as App.replayPageEnterAnimation — removes
  // then re-adds the class so the fade-up-from-above plays again on every
  // sort, even though @for just moves the existing rows rather than
  // recreating them (which would otherwise never replay a mount-triggered
  // CSS animation).
  private replaySortAnimation(): void {
    const element = this.tbodyRef?.nativeElement;
    if (!element) {
      return;
    }
    element.classList.remove('anim-preview-in');
    void element.offsetWidth;
    element.classList.add('anim-preview-in');
  }

  protected markPaid(invoice: InvoiceWithTotals): void {
    this.closeStatusMenu();
    this.updateStatus(invoice.id, { status: 'PAYEE' }, 'Facture marquée payée.');
  }

  protected cancelInvoice(invoice: InvoiceWithTotals): void {
    this.closeStatusMenu();
    this.updateStatus(invoice.id, { status: 'ANNULEE' }, 'Facture annulée.');
  }

  // Entry point for picking "Non payée" from the status menu, whatever the
  // invoice's current status — opens the due-date modal only if none is set
  // yet (skippable), per docs/roadmap.md Phase 16.
  protected moveToNonPayee(invoice: InvoiceWithTotals): void {
    this.closeStatusMenu();
    if (invoice.dueDate) {
      this.updateStatus(invoice.id, { status: 'NON_PAYEE' }, 'Facture marquée non payée.');
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
    this.updateStatus(invoice.id, { status: 'NON_PAYEE', dueDate }, 'Facture marquée non payée.');
  }

  protected onDueDateSkipped(): void {
    const invoice = this.dueDateModalInvoice();
    if (!invoice) {
      return;
    }
    this.dueDateModalInvoice.set(null);
    this.updateStatus(invoice.id, { status: 'NON_PAYEE' }, 'Facture marquée non payée.');
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
          this.highlightedPair.set({ devisId: devis.id, factureId: facture.id });
          this.toastService.success(`Devis converti en facture ${facture.number}.`);
        },
        error: () => {
          this.convertingDevisId.set(null);
          this.errorMessage.set('Impossible de créer la facture pour le moment.');
        },
      });
  }

  // "Créer une facture à partir du devis": unlike convertDevis above (an
  // untouched, already-persisted clone), this opens the creation wizard
  // pre-filled from the devis so the artisan can adjust anything — what was
  // actually agreed/delivered at the client's — before a facture exists.
  // Routed by the devis's own entryMode: a GUIDED devis jumps straight to
  // the rapide lignes step (never client — see InvoiceCreateShellPage's
  // cameFromDevis), a MANUAL one goes to its own canvas.
  protected createFromDevis(devis: InvoiceWithTotals): void {
    const commands =
      devis.entryMode === 'MANUAL'
        ? ['/factures/nouvelle/manuel']
        : ['/factures/nouvelle/rapide/lignes'];
    void this.router.navigate(commands, {
      queryParams: { type: 'FACTURE', fromDevisId: devis.id },
    });
  }

  // Retroactive devis creation: opens the number-picker modal (see
  // CreateDevisModalComponent) instead of creating anything immediately —
  // unlike convertDevis, the artisan must choose the devis's number first
  // (no natural "next in sequence" default exists for a document created
  // after the fact).
  protected openCreateDevisModal(facture: InvoiceWithTotals): void {
    this.createDevisModalInvoice.set(facture);
  }

  protected onCreateDevisModalClosed(): void {
    this.createDevisModalInvoice.set(null);
  }

  protected onDevisCreated(devis: InvoiceWithTotals): void {
    const factureId = this.createDevisModalInvoice()?.id;
    this.createDevisModalInvoice.set(null);
    this.invoices.update((invoices) => [
      devis,
      ...invoices.map((invoice) =>
        invoice.id === factureId
          ? { ...invoice, retroactiveDevis: { id: devis.id, number: devis.number } }
          : invoice,
      ),
    ]);
    if (factureId) {
      this.highlightedPair.set({ devisId: devis.id, factureId });
    }
    this.toastService.success(`Devis ${devis.number} créé.`);
  }

  protected openPreview(invoice: InvoiceWithTotals): void {
    this.previewInvoice.set(invoice);
    this.revokePreviewPdfUrl();
    this.previewPdfUrl.set(null);
    this.previewPdfSubscription = this.invoiceService
      .getPdfBlob(invoice.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => this.previewPdfUrl.set(URL.createObjectURL(blob)),
        error: (error: unknown) => {
          this.toastService.error(
            error instanceof TimeoutError
              ? 'La génération du PDF prend trop de temps. Réessayez.'
              : "Impossible de générer l'aperçu pour le moment.",
          );
          this.closePreview();
        },
      });
  }

  protected closePreview(): void {
    this.previewPdfSubscription?.unsubscribe();
    this.previewInvoice.set(null);
    this.revokePreviewPdfUrl();
    this.previewPdfUrl.set(null);
  }

  private revokePreviewPdfUrl(): void {
    const url = this.previewPdfUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  // The preview modal's own action buttons close it first — each action
  // already gives its own feedback (toast, new tab, or a navigation), so
  // leaving the preview open behind it would just add a second overlay to
  // dismiss.
  protected onPreviewShare(): void {
    const invoice = this.previewInvoice();
    if (!invoice) {
      return;
    }
    this.closePreview();
    void this.onShare(invoice);
  }

  protected onPreviewConvertToFacture(): void {
    const invoice = this.previewInvoice();
    if (!invoice) {
      return;
    }
    this.closePreview();
    this.convertDevis(invoice);
  }

  protected onPreviewCreateFromDevis(): void {
    const invoice = this.previewInvoice();
    if (!invoice) {
      return;
    }
    this.closePreview();
    this.createFromDevis(invoice);
  }

  protected onPreviewCreateDevisFromFacture(): void {
    const invoice = this.previewInvoice();
    if (!invoice) {
      return;
    }
    this.closePreview();
    this.openCreateDevisModal(invoice);
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
}
