import { Injectable } from '@angular/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

// Thrown by login() when the artisan dismissed the native Apple sheet —
// distinguishable from a real failure so the login page can stay silent
// instead of surfacing an error for a plain change of mind. Mirrors
// GoogleNativeLoginCancelledError.
export class AppleNativeLoginCancelledError extends Error {}

export interface AppleLoginResult {
  identityToken: string;
  // Present on every native sign-in (unlike name/email, which Apple only
  // ever includes the very first time) — sent to the backend too, so it
  // can capture a token it will later be able to revoke on account
  // deletion. See AuthService.appleTokenLogin.
  authorizationCode?: string;
}

// iOS's native Sign In with Apple (ASAuthorizationController under the
// hood), the same native-vs-browser-redirect split Google already has on
// Android (see GoogleNativeLoginService) — no Services ID/redirect needed
// here since this app never does a browser-based Apple flow, only this
// native one. Android/web never call this: Apple sign-in only exists on
// iOS in this app, see login.page.html's platformService.isIosApp() guard.
@Injectable({ providedIn: 'root' })
export class AppleNativeLoginService {
  private initialized: Promise<void> | null = null;

  private initialize(): Promise<void> {
    if (!this.initialized) {
      // No clientId/redirectUrl: both are only meaningful for Apple's
      // web/Android flow (a Services ID + a backend callback URL), neither
      // of which this native-only iOS integration uses.
      this.initialized = SocialLogin.initialize({ apple: {} });
    }
    return this.initialized;
  }

  async login(): Promise<AppleLoginResult> {
    await this.initialize();
    try {
      const { result } = await SocialLogin.login({ provider: 'apple', options: {} });
      if (!result.idToken) {
        throw new Error('Réponse Apple inattendue : aucun jeton reçu.');
      }
      return {
        identityToken: result.idToken,
        authorizationCode: result.authorizationCode,
      };
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'USER_CANCELLED') {
        throw new AppleNativeLoginCancelledError();
      }
      throw error;
    }
  }
}
