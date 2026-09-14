import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Web/Android counterpart to AppleOAuthEnabledGuard: gates the four
// browser-redirect routes (apple, apple/callback, apple/mobile-start,
// apple/mobile-callback) on APPLE_SERVICES_ID rather than APPLE_CLIENT_ID —
// a Services ID is a distinct Apple identifier type from the native app's
// bundle ID, only needed because neither the web nor the Android app can use
// ASAuthorizationController's native flow (see AuthService.appleWebLogin).
@Injectable()
export class AppleWebOAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get('APPLE_SERVICES_ID')) {
      throw new ServiceUnavailableException(
        "La connexion avec Apple (web/Android) n'est pas configurée sur ce déploiement.",
      );
    }
    return true;
  }
}
