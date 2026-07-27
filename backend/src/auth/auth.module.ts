import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '../mailer/mailer.module';
import { ReferralModule } from '../referral/referral.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoModeEnabledGuard } from './guards/demo-mode-enabled.guard';
import { GoogleOAuthEnabledGuard } from './guards/google-oauth-enabled.guard';
import { AuthTokenRepository } from './repositories/auth-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

// GoogleStrategy is only registered as a provider when both Google env vars
// are present. process.env is read directly here (not ConfigService)
// because @Module's metadata is evaluated at file-load time, before Nest's
// DI container — and therefore ConfigService — exists. Passport strategies
// throw eagerly from their own constructor when required options are
// missing, so an unconditional registration would crash boot for a
// deployment that never configured Google login (same "optional feature"
// posture as GROQ_API_KEY — see docs/roadmap.md Phase 13).
const googleProviders: Provider[] =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleStrategy] : [];

@Module({
  imports: [
    PassportModule,
    MailerModule,
    ReferralModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    RefreshTokenRepository,
    AuthTokenRepository,
    JwtStrategy,
    GoogleOAuthEnabledGuard,
    DemoModeEnabledGuard,
    ...googleProviders,
  ],
  exports: [AuthService],
})
export class AuthModule {}
