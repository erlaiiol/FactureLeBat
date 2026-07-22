import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'facturelebat.theme';

// Phase 9: manual light/dark toggle for "Chantier calibré" ‚ persisted the
// same way as the invoice draft (Phase 6)/tour state (Phase 8) — a single
// providedIn: 'root' service, localStorage read/write wrapped in try/catch
// so private-browsing/storage failures degrade to the system preference
// instead of blocking the app.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.readInitialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      this.writeToStorage(theme);
    });
  }

  toggle(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private readInitialTheme(): Theme {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Storage unavailable — fall through to the system preference.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private writeToStorage(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the choice simply
      // won't survive a refresh; the in-memory toggle still works.
    }
  }
}
