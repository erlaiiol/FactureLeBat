import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Same role as GoogleOAuthEnabledGuard: a clean 503 on POST /auth/apple/*
// instead of AuthService.appleTokenLogin throwing halfway through when
// APPLE_CLIENT_ID was never configured. Only the client ID gates this route
// — APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY are a separate, optional
// concern (revoking the token on account deletion), not required to log in.
@Injectable()
export class AppleOAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get('APPLE_CLIENT_ID')) {
      throw new ServiceUnavailableException(
        "La connexion avec Apple n'est pas configurée sur ce déploiement.",
      );
    }
    return true;
  }
}
