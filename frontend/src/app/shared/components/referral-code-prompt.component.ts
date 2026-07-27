import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '@capacitor/clipboard';
import { PlatformService } from '../../core/services/platform.service';
import { BigButtonComponent } from './big-button.component';

// A referral code is 8 uppercase letters/digits, excluding the
// visually-confusable characters the backend's generator already avoids
// (0/O, 1/I) — see backend/src/referral/referral-code-generator.util.ts.
// Loose enough to tolerate a stray dash/space from hand-typing or a
// slightly different length if that generator ever changes.
const REFERRAL_CODE_PATTERN = /^[A-Z2-9]{6,10}$/;

// Guards the one-time, best-effort clipboard read below to a single attempt
// per device install — never re-nags on every visit to connexion/inscription.
const CLIPBOARD_CHECKED_KEY = 'referral_clipboard_checked_v1';

function normalize(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

// Phase 29: the standalone "J'ai un code de parrainage" affordance shown on
// native mobile only (connexion/inscription) — a plain, always-editable text
// field already covers the web case (see register.page.html's own
// referralCode control, prefilled from ?ref=). This component instead
// covers the mobile-specific paths the roadmap called for: a tappable
// Universal/App Link opening the app directly with a code already known
// (prefillCode), and — best-effort, never silent/automatic — a clipboard
// check for the "link tapped before the app was installed" case (see
// docs/roadmap.md Phase 29's Non-goals: this is a deliberate substitute for
// true deferred deep linking, not a claimed equivalent).
@Component({
  selector: 'app-referral-code-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BigButtonComponent],
  template: `
    @if (platformService.isNativeApp()) {
      <div class="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
        @if (detectedCode(); as code) {
          <p class="text-sm text-ink">
            Code de parrainage détecté :
            <span class="font-mono font-semibold">{{ code }}</span>
            — l'utiliser ?
          </p>
          <div class="flex gap-2">
            <app-big-button type="button" variant="secondary" tone="solid" (click)="confirm(code)">
              Utiliser ce code
            </app-big-button>
            <app-big-button type="button" variant="secondary" tone="subtle" (click)="dismiss()">
              Ignorer
            </app-big-button>
          </div>
        } @else if (expanded()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink">Code de parrainage</span>
            <input
              type="text"
              [(ngModel)]="manualCode"
              placeholder="CODE-PARRAINAGE"
              class="rounded-lg border border-line px-4 py-3 uppercase text-ink"
            />
          </label>
          <app-big-button
            type="button"
            variant="secondary"
            tone="subtle"
            [disabled]="!manualCode().trim()"
            (click)="confirm(manualCode())"
          >
            Valider
          </app-big-button>
        } @else {
          <app-big-button
            type="button"
            variant="secondary"
            tone="subtle"
            (click)="expanded.set(true)"
          >
            J'ai un code de parrainage
          </app-big-button>
        }
      </div>
    }
  `,
})
export class ReferralCodePromptComponent implements OnInit {
  protected readonly platformService = inject(PlatformService);

  // Set by the parent when the app was opened via a Universal/App Link
  // carrying ?ref=CODE (see app.component's appUrlOpen listener) — the
  // highest-confidence source, so it always wins over a clipboard guess.
  readonly prefillCode = input<string | null>(null);
  readonly codeConfirmed = output<string>();

  protected readonly detectedCode = signal<string | null>(null);
  protected readonly expanded = signal(false);
  protected readonly manualCode = signal('');

  ngOnInit(): void {
    const prefill = this.prefillCode();
    if (prefill) {
      this.detectedCode.set(normalize(prefill));
      return;
    }
    if (this.platformService.isNativeApp()) {
      void this.checkClipboardOnce();
    }
  }

  private async checkClipboardOnce(): Promise<void> {
    if (localStorage.getItem(CLIPBOARD_CHECKED_KEY)) {
      return;
    }
    localStorage.setItem(CLIPBOARD_CHECKED_KEY, '1');
    try {
      const { value } = await Clipboard.read();
      const candidate = normalize(value ?? '');
      if (REFERRAL_CODE_PATTERN.test(candidate)) {
        this.detectedCode.set(candidate);
      }
    } catch {
      // Clipboard read can be denied/unavailable (iOS paste permission,
      // empty clipboard, no plugin support) — silently falls back to the
      // plain "J'ai un code de parrainage" button, never blocks anything.
    }
  }

  protected confirm(code: string): void {
    const normalized = normalize(code);
    if (!normalized) {
      return;
    }
    this.codeConfirmed.emit(normalized);
  }

  protected dismiss(): void {
    this.detectedCode.set(null);
  }
}
