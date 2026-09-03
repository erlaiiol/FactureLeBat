import { BillingStatus } from '../../core/models/billing.model';

// 1.2/facturx-monthly-quota revision: shared by InvoiceListRowComponent
// ("Facture électronique"/"Envoyer via PA" in Mes documents) and the
// post-creation success screens (preview-step/manual) — the same rule
// PlanGateService.canUseFacturX enforces server-side, computed here from
// BillingStatus so the UI can lock preventively (lock icon, paywall on
// click) instead of only failing after a doomed request. Mirrors this
// codebase's other preventive locks (e.g. InvoiceCreateModeChoicePage's
// voiceLocked) in failing toward "locked" while status hasn't loaded yet,
// rather than briefly flashing an unlocked action that then 402s.
export function facturXLockedFor(
  invoice: { facturXUsed: boolean },
  status: BillingStatus | null,
): boolean {
  if (invoice.facturXUsed) {
    return false; // this invoice's slot, if any, was already spent — always free from here on
  }
  if (!status) {
    return true;
  }
  if (status.hasPremiumAccess || status.facturXFreeLimit === null) {
    return false;
  }
  return status.facturXUsedThisMonth >= status.facturXFreeLimit;
}
