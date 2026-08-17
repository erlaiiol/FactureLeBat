import { Injectable, effect, signal } from '@angular/core';

export type QuantityInputMode = 'wheel' | 'keyboard';

const STORAGE_KEY = 'facturele.quantityInputMode';

// The quantity mini-input on a collapsed catalog-picked line (see
// invoice-create-lines-step.page.html) is the one field mode rapide still
// asks the artisan to type — this preference lets them swap that typing for
// a scroll-wheel odometer instead, the same "click more, type less" idea as
// app-big-button. Persisted the same way as ThemeService's dark-mode toggle:
// a single providedIn: 'root' signal backed by localStorage, degrading to
// the default if storage is unavailable (private browsing, quota).
// Defaults to 'wheel' — the whole point of mode rapide is typing less, so an
// artisan who never touches this preference gets the faster path by default.
@Injectable({ providedIn: 'root' })
export class QuantityInputModeService {
  readonly mode = signal<QuantityInputMode>(this.readInitialMode());

  constructor() {
    effect(() => this.writeToStorage(this.mode()));
  }

  toggle(): void {
    this.mode.set(this.mode() === 'wheel' ? 'keyboard' : 'wheel');
  }

  private readInitialMode(): QuantityInputMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'wheel' || stored === 'keyboard') {
        return stored;
      }
    } catch {
      // Storage unavailable — fall through to the default.
    }
    return 'wheel';
  }

  private writeToStorage(mode: QuantityInputMode): void {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the choice simply
      // won't survive a refresh; the in-memory toggle still works.
    }
  }
}
