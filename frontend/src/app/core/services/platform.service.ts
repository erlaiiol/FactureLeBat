import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

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
}
