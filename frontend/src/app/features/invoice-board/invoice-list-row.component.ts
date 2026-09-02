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
import { RouterLink } from '@angular/router';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { BillingService } from '../../core/services/billing.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { PaywallService } from '../../core/services/paywall.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { IconCheckComponent } from '../../shared/components/icon-check.component';
import { IconDotsVerticalComponent } from '../../shared/components/icon-dots-vertical.component';
import { IconLockComponent } from '../../shared/components/icon-lock.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { facturXLockedFor } from '../../shared/utils/facturx-quota.util';
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
  imports: [
    DatePipe,
    RouterLink,
    CentsToEurosPipe,
    BadgeComponent,
    IconCheckComponent,
    IconDotsVerticalComponent,
    IconLockComponent,
  ],
  templateUrl: './invoice-list-row.component.html',
})
export class InvoiceListRowComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly paywallService = inject(PaywallService);
  private readonly billingService = inject(BillingService);

  readonly invoice = input.required<InvoiceWithTotals>();
  // Devis-only: the number of the facture it was converted into, if any —
  // null for a facture-less devis and for every facture row (a facture
  // never shows its own origin here, only the devis side links forward).
  readonly attachedFactureNumber = input<string | null>(null);
  // Facture-only counterpart: the number of the devis retroactively created
  // from it, if any — null otherwise and for every devis row (see
  // InvoiceService.convertToDevis). Same "origin row shows a link to what
  // it spawned" convention as attachedFactureNumber above, just the other
  // direction.
  readonly attachedDevisNumber = input<string | null>(null);
  // True while this row is part of the currently-toggled devis/facture
  // pair (see InvoiceBoardPage.highlightedPair) — applies the same tint to
  // both rows regardless of how far apart they land in the sorted list.
  readonly highlighted = input(false);
  readonly converting = input(false);
  readonly sharing = input(false);
  // 1.2/manual-mode-free-tier revision: true for a free-tier company —
  // "Facture à partir du devis"/"Créer un devis" (openConvertModal/
  // createDevisFromFacture below) carry no free credit at all, unlike mode
  // rapide's one lifetime invoice, so they're locked preventively here
  // (lock icon, click opens the paywall instead of emitting) rather than
  // failing only once the backend's QUICK_ACTION gate is hit — see
  // PlanGateService.assertCanCreateInvoice's header comment.
  readonly premiumRequired = input(false);
  // Phase 1.2-4 (2026 e-invoicing reform): whether this company can
  // transmit via SUPER PDP at all (gates showing the action) and whether
  // this specific row is mid-transmission (busy state) — same pattern as
  // converting/sharing above.
  readonly superPdpConnected = input(false);
  // Phase 1.2-6: distinct from superPdpConnected — shows a "connect it"
  // hint in place of the action only when the feature actually exists on
  // this deployment (never when SUPER PDP isn't configured at all).
  readonly superPdpConfigured = input(false);
  readonly transmitting = input(false);
  // Bug fix (2026-08-25 pipeline review): the row previously always showed
  // "Envoyer via PA" regardless of invoice().eInvoiceTransmissionStatus,
  // which let an artisan resubmit an already-transmitted FACTURE to SUPER
  // PDP — a real duplicate-transmission risk, not just a UI nicety. Once
  // sent, the action is replaced by a status readout + a refresh action
  // (refreshingTransmission/refreshTransmissionStatus below) instead.
  readonly refreshingTransmission = input(false);
  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): a shared
  // clock tick from InvoiceBoardPage (one interval for the whole board, not
  // one per row) — drives pendingAutoTransmit/countdownLabel below without
  // this component needing its own setInterval.
  readonly nowMs = input(Date.now());
  // Facture-only: whether the status-change menu is open for this row.
  readonly statusMenuOpen = input(false);
  // Whether the actions ("...") dropdown is open for this row.
  readonly actionsMenuOpen = input(false);

  readonly transmit = output<void>();
  readonly refreshTransmissionStatus = output<void>();
  readonly cancelAutoTransmit = output<void>();
  // Opens DevisToFactureModalComponent — merges what used to be two separate
  // actions ("Facture identique" and "Facture à partir du devis") into one
  // entry point, since both are just different ways to turn this same devis
  // into a facture (see InvoiceBoardPage.openConvertModal).
  readonly openConvertModal = output<void>();
  readonly createDevisFromFacture = output<void>();
  readonly toggleHighlight = output<void>();
  readonly toggleStatusMenu = output<void>();
  readonly toggleActionsMenu = output<void>();
  readonly setPaid = output<void>();
  readonly setCancelled = output<void>();
  readonly setNonPayee = output<void>();
  // Phase 1.1-3: only ever emitted from a menu entry gated on
  // invoice().depositAmountCents !== null — see the template.
  readonly setDepositPaid = output<void>();
  readonly share = output<void>();
  // Opens the preview modal (see InvoicePreviewModalComponent) — emitted
  // from the <tr> itself; the status and actions columns stop propagation
  // so their own dropdown triggers still take priority over opening it.
  readonly rowClick = output<void>();

  // Phase 1.1-1: the "Signé" column's checkbox — a no-op while
  // hasSignatureProof is true (the checkbox is locked, see
  // invoice-list-row.component.html), otherwise toggles manuallySigned.
  readonly toggleManuallySigned = output<void>();
  readonly openSignatureModal = output<void>();
  readonly openSignatureView = output<void>();
  readonly deleteSignature = output<void>();

  protected readonly isDevis = computed(() => this.invoice().documentType === 'DEVIS');
  protected readonly overdue = computed(() => !this.isDevis() && isOverdue(this.invoice()));
  protected readonly signed = computed(
    () => this.invoice().hasSignatureProof || this.invoice().manuallySigned,
  );

  // 1.2/facturx-monthly-quota revision: gates "Facture électronique"
  // (download) and "Envoyer via PA" (transmit) — see facturXLockedFor's own
  // comment. Distinct from premiumRequired above: that one is a flat
  // company-wide lock (0 free credit for these two actions), this one
  // depends on both the company's monthly usage AND this specific
  // invoice's own facturXUsed flag.
  protected readonly facturXLocked = computed(() =>
    facturXLockedFor(this.invoice(), this.billingService.status()),
  );

  protected readonly statusLabel = computed(() => {
    if (this.overdue()) {
      return 'En retard';
    }
    switch (this.invoice().status) {
      case 'PAYEE':
        return 'Payée';
      case 'ANNULEE':
        return 'Annulée';
      case 'ACOMPTE_VERSE':
        return 'Acompte versé';
      default:
        return 'Non payée';
    }
  });

  protected readonly statusVariant = computed<
    'warning' | 'danger' | 'success' | 'secondary' | 'info'
  >(() => {
    if (this.overdue()) {
      return 'danger';
    }
    switch (this.invoice().status) {
      case 'PAYEE':
        return 'success';
      case 'ANNULEE':
        return 'secondary';
      case 'ACOMPTE_VERSE':
        return 'info';
      default:
        return 'warning';
    }
  });

  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): true while
  // this FACTURE is queued for automatic PA transmission and the grace
  // period hasn't elapsed yet — orthogonal to eInvoiceTransmissionStatus
  // (still NOT_SENT the whole time), so this check has to come first in the
  // template's @if/@else-if chain, ahead of canTransmit below, or a pending
  // auto-transmission would render as a plain manual "Envoyer via PA".
  protected readonly pendingAutoTransmit = computed(() => {
    const at = this.invoice().scheduledTransmitAt;
    if (!at) {
      return false;
    }
    return new Date(at).getTime() > this.nowMs();
  });
  protected readonly autoTransmitCountdownLabel = computed(() => {
    const at = this.invoice().scheduledTransmitAt;
    if (!at) {
      return '';
    }
    const remainingMinutes = Math.max(
      1,
      Math.round((new Date(at).getTime() - this.nowMs()) / 60_000),
    );
    return `Envoi automatique dans ${remainingMinutes}min`;
  });

  // Phase 1.2-4/1.2-6 (2026 e-invoicing reform): REJECTED can still be
  // resent (the artisan fixes something and retries) — every other non-
  // NOT_SENT status means SUPER PDP already has a live copy of this
  // invoice, so re-transmitting would create a duplicate over there rather
  // than update anything.
  protected readonly canTransmit = computed(
    () =>
      this.invoice().eInvoiceTransmissionStatus === 'NOT_SENT' ||
      this.invoice().eInvoiceTransmissionStatus === 'REJECTED',
  );
  protected readonly alreadyTransmitted = computed(
    () => this.invoice().eInvoiceTransmissionStatus !== 'NOT_SENT',
  );
  protected readonly transmissionStatusLabel = computed(() => {
    switch (this.invoice().eInvoiceTransmissionStatus) {
      case 'SENT':
        return 'Envoyée à la PA';
      case 'VALIDATED':
        return 'Validée par la PA';
      case 'DELIVERED':
        return 'Délivrée au destinataire';
      case 'ACCEPTED':
        return 'Acceptée';
      case 'REJECTED':
        return 'Rejetée par la PA';
      default:
        return null;
    }
  });

  protected pdfUrl(): string {
    return this.invoiceService.pdfUrl(this.invoice().id);
  }

  // Phase 1.2-3 (2026 e-invoicing reform) — FACTURE-only, gated by isDevis()
  // in the template the same way every other FACTURE-only action here is.
  protected facturXUrl(): string {
    return this.invoiceService.facturXUrl(this.invoice().id);
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

  // Same fixed-position technique as menuPosition above, but right-aligned
  // to the trigger (the actions column sits at the far right edge of a
  // horizontally-scrollable table, so a left-aligned menu would frequently
  // overflow past the viewport).
  private static readonly ACTIONS_MENU_WIDTH = 176;
  protected readonly actionsMenuPosition = signal<{ top: number; left: number } | null>(null);
  // CSS-overlap fix (2026-08-25 pipeline review): 1.2-3/1.2-4/1.2-6 each
  // added another conditional entry to this dropdown ("Facture électronique",
  // "Envoyer via PA"/status, the SUPER PDP "connect it" hint), and the menu
  // had no upper bound on its own height — just `top: rect.bottom + 4` with
  // no flip or clamp. A FACTURE row near the bottom of a long list (or on a
  // short mobile viewport) could render a menu that runs off the bottom of
  // the screen with no way to reach its last item. Now clamped to whichever
  // side (above/below the trigger) has more room, with a scrollable
  // max-height as a last resort if that space is still tight.
  protected readonly actionsMenuMaxHeight = signal<number | null>(null);
  private static readonly MENU_MARGIN = 8;
  private static readonly MENU_GAP = 4;

  protected onActionsMenuClick(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const { MENU_MARGIN: margin, MENU_GAP: gap } = InvoiceListRowComponent;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
    this.actionsMenuPosition.set({
      top: openAbove ? margin : rect.bottom + gap,
      left: rect.right - InvoiceListRowComponent.ACTIONS_MENU_WIDTH,
    });
    this.actionsMenuMaxHeight.set(Math.max(120, openAbove ? spaceAbove : spaceBelow));
    this.toggleActionsMenu.emit();
  }

  // Both quick-creation menu entries funnel through here rather than
  // emitting openConvertModal/createDevisFromFacture directly when
  // premiumRequired() — same paywall the global 402 interceptor would show,
  // just triggered preventively instead of after a doomed request.
  protected onConvertModalClick(): void {
    this.toggleActionsMenu.emit();
    if (this.premiumRequired()) {
      this.paywallService.show();
      return;
    }
    this.openConvertModal.emit();
  }

  protected onCreateDevisFromFactureClick(): void {
    this.toggleActionsMenu.emit();
    if (this.premiumRequired()) {
      this.paywallService.show();
      return;
    }
    this.createDevisFromFacture.emit();
  }

  // The "Facture électronique" link is a plain <a [href]>, a real browser
  // navigation rather than an HttpClient call — the premium-gate
  // interceptor never sees it, so this is the only place a locked download
  // gets caught before actually leaving the app.
  protected onFacturXLinkClick(event: MouseEvent): void {
    this.toggleActionsMenu.emit();
    if (this.facturXLocked()) {
      event.preventDefault();
      this.paywallService.show();
    }
  }

  protected onTransmitClick(): void {
    this.toggleActionsMenu.emit();
    if (this.facturXLocked()) {
      this.paywallService.show();
      return;
    }
    this.transmit.emit();
  }
}
