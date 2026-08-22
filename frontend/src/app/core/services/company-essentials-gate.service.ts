import { Injectable, signal } from '@angular/core';
import { CompanyProfile } from '../models/company.model';
import { isCompanyEssentialsComplete } from '../models/company-essentials.util';

// First-invoice-pipeline reversal: name/SIRET/address only ever block at the
// moment a real PDF is about to be produced/sent (share, download, exact-PDF
// preview) — never at invoice creation itself. Same "single app-wide flag,
// triggered from wherever the refusal can actually occur" shape as
// PaywallService, since the call sites (invoice-create-shell.page.ts,
// invoice-create-preview-step.page.ts) are otherwise unrelated screens.
@Injectable({ providedIn: 'root' })
export class CompanyEssentialsGateService {
  readonly visible = signal(false);
  // Takes the freshly-saved profile, not just a bare callback — every call
  // site's own `company`/`companyProfile` signal is a one-shot local
  // snapshot (same pre-existing shape as InvoiceDraftStore.company), never
  // otherwise refreshed after this modal PATCHes the real profile. Without
  // handing the fresh value back here, `onResume`'s retry of the original
  // action would immediately re-run `ensureComplete` against the same STALE
  // (still-incomplete) snapshot and re-open the modal right away — caught
  // in real browser testing, not hypothetical.
  private pendingResume: ((profile: CompanyProfile) => void) | null = null;

  // Returns true (and does nothing else) when the profile is already
  // complete, so every call site can call this unconditionally right before
  // its real action. Otherwise opens the modal, remembers `onResume` to fire
  // once the artisan saves the missing fields, and returns false so the
  // caller aborts its own action for now.
  ensureComplete(
    profile: CompanyProfile | null,
    onResume: (profile: CompanyProfile) => void,
  ): boolean {
    if (profile && isCompanyEssentialsComplete(profile)) {
      return true;
    }
    this.pendingResume = onResume;
    this.visible.set(true);
    return false;
  }

  dismiss(): void {
    this.visible.set(false);
    this.pendingResume = null;
  }

  // Called by the modal once the artisan has actually saved the missing
  // fields — resumes whichever action was refused, exactly once, handing it
  // the fresh profile so its own retry sees the up-to-date completeness.
  resolveAfterSave(profile: CompanyProfile): void {
    this.visible.set(false);
    const resume = this.pendingResume;
    this.pendingResume = null;
    resume?.(profile);
  }
}
