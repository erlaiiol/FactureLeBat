import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';

const STORAGE_KEY = 'facturele.ratingPrompt.v1';
const SHARES_BEFORE_FIRST_PROMPT = 3;
const COOLDOWN_DAYS = 90;
const MAX_LIFETIME_PROMPTS = 3;

interface RatingPromptState {
  shareCount: number;
  promptCount: number;
  lastPromptedAt: string | null;
}

const INITIAL_STATE: RatingPromptState = { shareCount: 0, promptCount: 0, lastPromptedAt: null };

// Nudges the artisan toward an App Store/Play Store rating right after a
// genuine positive moment — see notifyInvoiceShared below. A no-op on web,
// same Capacitor.isNativePlatform() guard as PushRegistrationService:
// requestReview() only exists inside the native shell.
//
// Deliberately no custom "are you enjoying the app?" pre-screen: Apple
// guideline 2.3.1 treats gating SKStoreReviewController behind your own
// happy-path filter as manipulative, so this calls the native API directly
// and lets iOS/Android's own frequency throttling (a few times a year,
// entirely outside this app's control) decide whether a dialog actually
// appears. The counters below only decide when *this app* asks — never
// whether the OS displays anything, which isn't observable from
// requestReview()'s Promise<void>.
@Injectable({ providedIn: 'root' })
export class RatingPromptService {
  // Called from InvoiceShareService.share() once the artisan has completed
  // a share interaction ('shared' or 'mailto-fallback' — a 'compose-email'
  // outcome only opens the SMTP modal and hasn't sent anything yet, so it
  // doesn't count). This is a proxy for "used the feature successfully",
  // not proof of delivery: 'shared' only means the OS handed the PDF to
  // whichever app the artisan picked, never that they actually hit send
  // there (see InvoiceShareService.share's comment) — good enough for a
  // review-prompt heuristic, but never treat this signal as confirmation an
  // invoice reached its recipient.
  async notifyInvoiceShared(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    const state = this.loadState();
    state.shareCount += 1;
    if (this.shouldPrompt(state)) {
      state.promptCount += 1;
      state.lastPromptedAt = new Date().toISOString();
      this.saveState(state);
      try {
        await InAppReview.requestReview();
      } catch {
        // Best-effort — an unavailable native review flow (e.g. no Play
        // Store on this device) just means no prompt this time, never an
        // error surfaced to the artisan.
      }
      return;
    }
    this.saveState(state);
  }

  private shouldPrompt(state: RatingPromptState): boolean {
    if (
      state.promptCount >= MAX_LIFETIME_PROMPTS ||
      state.shareCount < SHARES_BEFORE_FIRST_PROMPT
    ) {
      return false;
    }
    if (!state.lastPromptedAt) {
      return true;
    }
    const daysSinceLastPrompt =
      (Date.now() - new Date(state.lastPromptedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastPrompt >= COOLDOWN_DAYS;
  }

  private loadState(): RatingPromptState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...INITIAL_STATE, ...JSON.parse(raw) } : { ...INITIAL_STATE };
    } catch {
      return { ...INITIAL_STATE };
    }
  }

  private saveState(state: RatingPromptState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Best-effort persistence — a private-browsing/storage-full failure
      // just means the next share re-triggers the same milestone, never a
      // crash.
    }
  }
}
