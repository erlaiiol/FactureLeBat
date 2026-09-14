import { Injectable } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { environment } from '../../../environments/environment';

// Android has no native Sign in with Apple SDK (unlike iOS's
// ASAuthorizationController — see AppleNativeLoginService), so this opens
// Apple's own authorize page in the system browser instead, never the app's
// own WebView (same rule PlatformService.openWebSubscriptionPage already
// follows for Stripe checkout). The backend's GET /auth/apple/mobile-start
// builds the real Apple authorize URL and sets the CSRF state cookie; this
// call doesn't resolve with a login result the way GoogleNativeLoginService
// or AppleNativeLoginService do — completion instead comes back through
// DeepLinkService's appUrlOpen listener once Apple's callback redirects to
// the app's own facturele.net/auth/apple-mobile-return App Link.
//
// window.location.origin (not a hardcoded domain) matters here: Android's
// WebView genuinely serves under https://<hostname> (see
// capacitor.config.ts's androidScheme comment), so this resolves to the
// real backend both in prod and under CAPACITOR_LOCAL_HOST local testing,
// the same way environment.apiBaseUrl's relative '/api' already does for
// every other Android API call — Browser.open() just needs an absolute URL
// since, unlike HttpClient, it has no "current page" to resolve a relative
// one against.
@Injectable({ providedIn: 'root' })
export class AppleAndroidLoginService {
  start(): Promise<void> {
    const url = `${window.location.origin}${environment.apiBaseUrl}/auth/apple/mobile-start`;
    return Browser.open({ url });
  }
}
