import { Injectable, inject } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

// Phase 29: warm Universal/App Link handling — tapping
// https://facturele.net/inscription?ref=CODE with the app already installed
// fires appUrlOpen instead of opening a browser tab (once the iOS
// Associated Domains entitlement / Android App Links intent filter and the
// matching apple-app-site-association/assetlinks.json are in place — see
// docs/roadmap.md Phase 29). A no-op on web, same "native-only, no-op
// otherwise" convention as PushRegistrationService — @capacitor/app was
// already a dependency, unused until this.
//
// Also the landing spot for Android's Apple Sign-In bridge (see
// AppleAndroidLoginService): the same facturele.net App Link now also
// matches /auth/apple-mobile-return, carrying code/id_token in its query
// string once the backend's POST /auth/apple/mobile-callback redirects
// there (see AuthController) — this app link handoff has to be an https
// URL rather than a custom scheme precisely so it reuses the same
// already-verified App Link instead of registering a second one.
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private listening = false;

  listen(): void {
    if (!Capacitor.isNativePlatform() || this.listening) {
      return;
    }
    this.listening = true;
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.pathname === '/auth/apple-mobile-return') {
          void this.completeAppleAndroidLogin(parsed);
          return;
        }
        const ref = parsed.searchParams.get('ref');
        void this.router.navigate([parsed.pathname || '/inscription'], {
          queryParams: ref ? { ref } : {},
        });
      } catch {
        // A malformed or unexpected URL must never crash the app shell —
        // worst case, the link just doesn't navigate anywhere.
      }
    });
  }

  private async completeAppleAndroidLogin(returnUrl: URL): Promise<void> {
    // The system browser tab (Custom Tab/Chrome) that carried the Apple
    // flow is a separate window from the app — closing it here is what
    // actually hands focus back, App Link interception alone doesn't
    // dismiss it. Harmless no-op if it's already gone.
    void Browser.close().catch(() => undefined);

    const idToken = returnUrl.searchParams.get('id_token');
    const code = returnUrl.searchParams.get('code') ?? undefined;
    if (!idToken) {
      void this.router.navigate(['/connexion']);
      return;
    }
    try {
      await firstValueFrom(this.authService.appleTokenLogin(idToken, code, 'android'));
      void this.router.navigateByUrl('/');
    } catch {
      // Same "never crash the app shell" posture as the malformed-URL case
      // above — a failed exchange just leaves the artisan on the login page
      // to retry, with no on-screen error message plumbed through yet (this
      // service has no access to LoginPage's signals to set one).
      void this.router.navigate(['/connexion']);
    }
  }
}
