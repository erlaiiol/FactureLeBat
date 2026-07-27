import { Injectable, inject } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';

// Phase 29: warm Universal/App Link handling — tapping
// https://facturele.net/inscription?ref=CODE with the app already installed
// fires appUrlOpen instead of opening a browser tab (once the iOS
// Associated Domains entitlement / Android App Links intent filter and the
// matching apple-app-site-association/assetlinks.json are in place — see
// docs/roadmap.md Phase 29). A no-op on web, same "native-only, no-op
// otherwise" convention as PushRegistrationService — @capacitor/app was
// already a dependency, unused until this.
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly router = inject(Router);
  private listening = false;

  listen(): void {
    if (!Capacitor.isNativePlatform() || this.listening) {
      return;
    }
    this.listening = true;
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
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
}
