import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Runs before AuthGuard('google') on the /auth/google* routes (see
// auth.controller.ts's @UseGuards order) so an unconfigured deployment gets
// a clean 503 instead of passport throwing "Unknown authentication
// strategy" when GoogleStrategy was never registered (see auth.module.ts).
@Injectable()
export class GoogleOAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get('GOOGLE_CLIENT_ID') || !this.config.get('GOOGLE_CLIENT_SECRET')) {
      throw new ServiceUnavailableException(
        "La connexion avec Google n'est pas configurée sur ce déploiement.",
      );
    }
    return true;
  }
}
