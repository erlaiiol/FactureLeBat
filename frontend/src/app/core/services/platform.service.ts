import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

// Phase 22: which shell the app is currently running inside. Read once at
// construction — the platform never changes mid-session, unlike Theme's
// toggle-able signal — and exposed as a signal only for consistency with
// the rest of core/services, not because it's ever expected to change.
// The one thing this drives today: PaywallModalComponent/subscribe.page.ts
// must never surface a Stripe checkout CTA on iOS (Apple 3.1.1 "external
// subscription, business tool" pattern — see docs/roadmap.md Phase 22).
@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isIosApp = signal(Capacitor.getPlatform() === 'ios');
  readonly isNativeApp = signal(Capacitor.isNativePlatform());

  // The iOS shell's own WKWebView origin is capacitor://facturele.net, not
  // the real site — see capacitor.config.ts's TODO before this domain ever
  // changes — so this is a plain constant rather than derived from
  // window.location like environment.prod.ts's resolveApiBaseUrl. Opens in
  // the system browser (SFSafariViewController on iOS), never the app's own
  // WebView, which is what keeps this a mere link-out and not an in-app
  // payment flow under Apple 3.1.1.
  openWebSubscriptionPage(): void {
    void Browser.open({ url: 'https://facturele.net/abonnement' });
  }

  // Phase 1.7: an Apple IAP subscription is managed/canceled through iOS's
  // own Settings app, never through this app (there is no Stripe-portal
  // equivalent for it) — itms-apps:// is a system URL scheme, not http(s),
  // so it can't go through Browser.open (SFSafariViewController only
  // handles http(s)); a direct navigation is what the WKWebView correctly
  // hands off to the OS instead, same pattern InvoiceShareService already
  // uses for mailto: links.
  openIosManageSubscriptionsSettings(): void {
    window.location.href = 'itms-apps://apps.apple.com/account/subscriptions';
  }
}
