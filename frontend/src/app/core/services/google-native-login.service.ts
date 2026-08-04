import { Injectable } from '@angular/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { environment } from '../../../environments/environment';

// Thrown by login() when the artisan dismissed the native account picker —
// distinguishable from a real failure so the login page can stay silent
// instead of surfacing an error for a plain change of mind.
export class GoogleNativeLoginCancelledError extends Error {}

// Android's Credential Manager sign-in (see docs/deployment.md for the
// Google Cloud / Play Console setup this needs), deliberately NOT the
// backend's browser-redirect /auth/google flow used on web: Google actively
// blocks that redirect from completing inside an embedded WebView (the
// app's own Capacitor WebView), so this instead gets a Google-signed ID
// token straight from the OS and hands it to AuthService.googleTokenLogin
// for the backend to verify. iOS never calls this — see login.page.html's
// platformService.isIosApp() guard (Apple 4.8 requires Sign in with Apple
// alongside any other third-party sign-in, so Google is hidden entirely on
// iOS rather than built there too).
@Injectable({ providedIn: 'root' })
export class GoogleNativeLoginService {
  private initialized: Promise<void> | null = null;

  private initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = SocialLogin.initialize({
        google: { webClientId: environment.googleWebClientId },
      });
    }
    return this.initialized;
  }

  // Resolves with the raw ID token to send to AuthService.googleTokenLogin —
  // never verified/trusted client-side, only the backend's verifyIdToken
  // call establishes an actual session.
  async login(): Promise<string> {
    await this.initialize();
    try {
      // No explicit `scopes` here on purpose: the plugin's Android side
      // already requests email/profile/openid as default scopes, and
      // passing custom ones instead requires MainActivity to implement its
      // own ModifiedMainActivityForSocialLoginPlugin interface (see
      // GoogleProvider.java) — "You CANNOT use scopes without modifying
      // the main activity" otherwise. Since the defaults already cover
      // everything AuthService.googleTokenLogin needs from the ID token,
      // there's nothing a custom scope would add here.
      const { result } = await SocialLogin.login({
        provider: 'google',
        options: {},
      });
      if (result.responseType !== 'online' || !result.idToken) {
        throw new Error('Réponse Google inattendue : aucun jeton reçu.');
      }
      return result.idToken;
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'USER_CANCELLED') {
        throw new GoogleNativeLoginCancelledError();
      }
      throw error;
    }
  }
}
