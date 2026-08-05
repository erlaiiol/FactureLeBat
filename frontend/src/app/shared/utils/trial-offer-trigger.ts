import { BillingService } from '../../core/services/billing.service';
import { TrialOfferService } from '../../core/services/trial-offer.service';

// Phase 33: called right after an invoice create request succeeds, from
// both creation paths (mode rapide's InvoiceCreatePreviewStepPage and mode
// manuel's InvoiceCreateManualPage) — the cached BillingService.status()
// signal was fetched before this invoice existed, so it can't yet know
// whether this was the free-trial invoice that just started the "1er mois à
// 2€" countdown (PlanGateService.recordInvoiceCreated, backend-side).
// refreshStatus() re-fetches it; if a trialOffer is now present, this was
// that first invoice, so open the CTA immediately while the artisan is
// still on the success screen. No-op (and no error surfaced) if the status
// refresh itself fails — this is a purely additive upsell, never worth
// blocking or erroring the invoice-creation success flow over. Same
// fire-and-forget `.subscribe()` (no takeUntilDestroyed) as app.ts's own
// refreshStatus() call: a single HTTP GET that completes on its own.
export function showTrialOfferAfterFirstInvoice(
  billingService: BillingService,
  trialOfferService: TrialOfferService,
): void {
  billingService.refreshStatus().subscribe({
    next: (status) => {
      if (status.trialOffer) {
        trialOfferService.show();
      }
    },
    error: () => {
      // See comment above — silently skipped.
    },
  });
}
