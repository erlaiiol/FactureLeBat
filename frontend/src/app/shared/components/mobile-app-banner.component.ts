import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ANDROID_APP_INTENT, APP_STORE_URL, PLAY_STORE_URL } from '../../core/app-store-links';
import { PlatformService } from '../../core/services/platform.service';

const DISMISSED_KEY = 'facturele-app-banner-dismissed';

@Component({
  selector: 'app-mobile-app-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside
        aria-label="Application mobile FactureLe"
        class="flex items-center gap-2 border-b border-line bg-surface px-2 py-2 text-ink sm:px-4"
      >
        <button
          type="button"
          (click)="dismiss()"
          aria-label="Fermer le bandeau de l’application"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-ink-soft hover:bg-secondary-subtle"
        >
          ×
        </button>
        <img
          src="/android-chrome-192x192.png"
          alt=""
          width="40"
          height="40"
          class="shrink-0 rounded-lg"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">FactureLe</p>
          <p class="text-xs text-ink-soft">
            {{ android ? 'Sur Google Play' : 'Sur l’App Store' }}
          </p>
        </div>
        <a
          [href]="storeUrl"
          (click)="openApp($event)"
          class="shrink-0 rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-fg hover:brightness-90"
        >
          {{ android ? 'Ouvrir' : 'Voir' }}
        </a>
      </aside>
    }
  `,
})
export class MobileAppBannerComponent {
  private readonly platform = inject(PlatformService);
  private readonly userAgent = navigator.userAgent;
  protected readonly android = /Android/i.test(this.userAgent);
  private readonly ios = /iPhone|iPod|iPad/i.test(this.userAgent);
  // Safari uses Apple's native Smart App Banner, which can also open an
  // installed app. Other iOS browsers get our store link instead.
  private readonly safari =
    /Safari/i.test(this.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(this.userAgent);
  protected readonly storeUrl = this.android ? PLAY_STORE_URL : APP_STORE_URL;
  protected readonly visible = signal(
    !this.platform.isNativeApp() &&
      (this.android || (this.ios && !this.safari)) &&
      !this.wasDismissed(),
  );

  protected openApp(event: MouseEvent): void {
    if (!this.android) return;
    event.preventDefault();
    // A user gesture launches the installed app; Chrome sends users to
    // Google Play via browser_fallback_url when the app is absent.
    window.location.assign(ANDROID_APP_INTENT);
  }

  protected dismiss(): void {
    this.visible.set(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage can be disabled; the banner still closes for this visit.
    }
  }

  private wasDismissed(): boolean {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
