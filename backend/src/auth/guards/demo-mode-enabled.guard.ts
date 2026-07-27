import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Runs before the demo-login route (see auth.controller.ts) so hitting it on
// a deployment that never set DEMO_MODE=true (i.e. every real deployment)
// gets a clean 503 instead of ever attempting to log in as one of the fixed
// demo accounts (see demo.constants.ts) — same "boots fine, feature just
// replies 503" posture as GoogleOAuthEnabledGuard above.
@Injectable()
export class DemoModeEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get('DEMO_MODE')) {
      throw new ServiceUnavailableException("Le mode démo n'est pas activé sur ce déploiement.");
    }
    return true;
  }
}
