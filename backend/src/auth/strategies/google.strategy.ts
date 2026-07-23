import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
}

// Only ever instantiated when both GOOGLE_CLIENT_ID/SECRET are set (see
// auth.module.ts) — the constructor would otherwise throw at boot, which is
// exactly the crash Phase 13 deliberately avoids for an unconfigured
// optional feature.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Ce compte Google ne fournit aucune adresse email.'));
      return;
    }
    const googleProfile: GoogleProfile = { googleId: profile.id, email };
    done(null, googleProfile);
  }
}
