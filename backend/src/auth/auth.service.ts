import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import appleSignin from 'apple-signin-auth';
import * as bcrypt from 'bcrypt';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import type { StringValue } from 'ms';
import { AuthTokenPurpose } from '../../generated/prisma/enums';
import {
  RefreshTokenModel as RefreshToken,
  UserModel as User,
} from '../../generated/prisma/models';
import { decryptSecret, encryptSecret } from '../common/secret-crypto.util';
import { SmtpCredentials } from '../mail-settings/entities/mail-settings.entity';
import { MailerService } from '../mailer/mailer.service';
import { ReferralService } from '../referral/referral.service';
import {
  BCRYPT_SALT_ROUNDS,
  CURRENT_TERMS_VERSION,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_REUSE_GRACE_PERIOD_MS,
} from './auth.constants';
import { DEMO_PROFILES } from './demo.constants';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PublicUser } from './entities/public-user.entity';
import { AuthTokenRepository } from './repositories/auth-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { generateOpaqueToken, hashToken } from './token.util';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  xsrfToken: string;
  rememberMe: boolean;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
}

export interface AppleProfile {
  appleId: string;
  email: string;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    emailVerified: user.emailVerifiedAt !== null,
    newsletterOptIn: user.newsletterOptIn,
  };
}

// Orchestration only, same role as InvoiceService: password hashing,
// token issuance/rotation, and email dispatch are each delegated (bcrypt,
// JwtService, MailerService) — no Prisma calls live here directly, only
// through the three repositories below.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // jsonwebtoken's SignOptions.expiresIn requires `ms`'s branded StringValue
  // template-literal type, which a generic `string` read from config can
  // never structurally satisfy — the format (e.g. "15m") is validated by
  // convention (see backend/.env.example), not the type system, so the cast
  // where this is assigned in the constructor is a deliberate, narrow trust
  // boundary rather than a blanket `any`.
  private readonly accessExpiresIn: StringValue;
  private readonly refreshExpiresInDays: number;
  private readonly refreshNotRememberedExpiresInDays: number;
  private readonly frontendUrl: string;
  private readonly systemSmtp: SmtpCredentials | null;
  private readonly systemMailFromName: string;
  private readonly systemMailFromAddress?: string;
  private readonly demoModeEnabled: boolean;

  // Same client ID as GoogleStrategy's web OAuth client (below), doing
  // double duty as the audience for native ID tokens too — the frontend's
  // native Sign-In SDK is configured with this exact value as its
  // `webClientId` (see docs/deployment.md), which is what makes Google mint
  // ID tokens whose `aud` claim matches what verifyIdToken checks here. No
  // separate "Android client ID" env var needed: that client only ever
  // exists in Google Cloud Console, matched by package name + signing
  // certificate, and is never referenced in code.
  private readonly googleClientId?: string;
  private readonly googleOAuthClient: OAuth2Client;

  // Native-only counterpart to the above — no browser-redirect flow, no
  // Services ID: the iOS app's ASAuthorizationController mints an identity
  // token whose `aud` is the app's own bundle ID, so that's what this is
  // (see frontend's AppleNativeLoginService and docs/roadmap.md Phase 1.5).
  // Team ID/Key ID/private key are a separate, optional concern — only
  // needed to exchange an authorizationCode for a refresh token, itself
  // only needed to revoke Apple's grant on account deletion.
  private readonly appleClientId?: string;
  private readonly appleTeamId?: string;
  private readonly appleKeyId?: string;
  private readonly applePrivateKey?: string;
  private readonly appEncryptionKey?: string;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    private readonly referralService: ReferralService,
    config: ConfigService,
  ) {
    this.accessExpiresIn = config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as StringValue;
    this.refreshExpiresInDays = config.get<number>('JWT_REFRESH_EXPIRES_IN_DAYS', 30);
    this.refreshNotRememberedExpiresInDays = config.get<number>(
      'JWT_REFRESH_NOT_REMEMBERED_EXPIRES_IN_DAYS',
      1,
    );
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
    this.systemMailFromName = config.get<string>('SYSTEM_MAIL_FROM_NAME', 'FactureLe');

    // System transactional email (verification, password reset) — a
    // deliberately separate credential set from Phase 12's per-artisan
    // mail-settings, which sends invoices from *their* address to *their*
    // clients. Optional, same "boots fine without it" posture as
    // GROQ_API_KEY: unset means these emails just can't be sent (see
    // sendVerificationEmail/sendPasswordResetEmail).
    const host = config.get<string>('SYSTEM_SMTP_HOST');
    const user = config.get<string>('SYSTEM_SMTP_USER');
    const password = config.get<string>('SYSTEM_SMTP_PASSWORD');
    const fromAddress = config.get<string>('SYSTEM_MAIL_FROM_ADDRESS');
    this.systemSmtp =
      host && user && password && fromAddress
        ? {
            host,
            port: config.get<number>('SYSTEM_SMTP_PORT', 587),
            secure: config.get<boolean>('SYSTEM_SMTP_SECURE', false),
            user,
            password,
          }
        : null;
    this.systemMailFromAddress = fromAddress;

    this.demoModeEnabled = config.get<boolean>('DEMO_MODE', false);

    this.googleClientId = config.get<string>('GOOGLE_CLIENT_ID');
    this.googleOAuthClient = new OAuth2Client(this.googleClientId);

    this.appleClientId = config.get<string>('APPLE_CLIENT_ID');
    this.appleTeamId = config.get<string>('APPLE_TEAM_ID');
    this.appleKeyId = config.get<string>('APPLE_KEY_ID');
    // \n-escaped in the env file (a real newline can't survive a single-line
    // KEY=VALUE), unescaped back to a real PEM block here — same convention
    // as every other multi-line credential this app reads from env.
    const rawApplePrivateKey = config.get<string>('APPLE_PRIVATE_KEY');
    this.applePrivateKey = rawApplePrivateKey?.replace(/\\n/g, '\n');
    this.appEncryptionKey = config.get<string>('APP_ENCRYPTION_KEY');
  }

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const referralCode = await this.referralService.generateUniqueCode();
    const user = await this.userRepository.createWithCompany({
      email: dto.email,
      passwordHash,
      newsletterOptIn: dto.newsletterOptIn ?? false,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      referralCode,
    });

    // Best-effort, never blocks registration — an unknown/invalid code is
    // silently ignored (see docs/roadmap.md Phase 29). The actual reward is
    // granted later, from verifyEmail(), not here — see
    // ReferralService.grantRewardForVerifiedEmail.
    await this.referralService
      .attributeReferral(dto.referralCode, user.companyId)
      .catch((error: unknown) =>
        this.logger.warn(`Échec de l'attribution du parrainage : ${String(error)}`),
      );

    // Best-effort, never blocks registration — email verification is
    // deliberately non-blocking (see docs/roadmap.md Phase 13).
    await this.sendVerificationEmail(user).catch((error: unknown) =>
      this.logger.warn(`Échec de l'envoi de l'email de vérification : ${String(error)}`),
    );

    // Registration auto-logs-in as a persistent (remembered) session —
    // forcing a fresh registrant to immediately log in again would be
    // needless friction (see docs/roadmap.md Phase 13).
    const tokens = await this.issueTokens(user, true);
    return { user: toPublicUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou mot de passe incorrect.');
    }
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect.');
    }
    const tokens = await this.issueTokens(user, dto.rememberMe ?? true);
    return { user: toPublicUser(user), tokens };
  }

  // Public even when DEMO_MODE is off — returns [] rather than gating behind
  // DemoModeEnabledGuard, so the frontend can always call this at login-page
  // load to decide whether to render the quick-login buttons, with no risk
  // of a dead/erroring button reaching a real deployment's login page.
  getDemoProfiles(): { key: string; label: string }[] {
    if (!this.demoModeEnabled) {
      return [];
    }
    return DEMO_PROFILES.map(({ key, label }) => ({ key, label }));
  }

  // Only reachable behind DemoModeEnabledGuard (see auth.controller.ts) —
  // logs straight into one of the fixed demo accounts with no password,
  // reusing the exact same issueTokens/cookie flow as a real login.
  async demoLogin(key: string): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const profile = DEMO_PROFILES.find((p) => p.key === key);
    if (!profile) {
      throw new NotFoundException('Profil de démonstration inconnu.');
    }
    const user = await this.userRepository.findByEmail(profile.email);
    if (!user) {
      throw new NotFoundException(
        'Compte de démonstration introuvable — le seed (`make demo`) a-t-il bien été lancé ?',
      );
    }
    const tokens = await this.issueTokens(user, true);
    return { user: toPublicUser(user), tokens };
  }

  async handleGoogleLogin(
    profile: GoogleProfile,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    let user = await this.userRepository.findByGoogleId(profile.googleId);
    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(profile.email);
      // Same email, first time via Google: link rather than create a
      // second account for the same person.
      user = existingByEmail
        ? await this.userRepository.linkGoogleId(existingByEmail.id, profile.googleId)
        : await this.userRepository.createWithCompany({
            email: profile.email,
            googleId: profile.googleId,
            newsletterOptIn: false,
            termsAcceptedAt: new Date(),
            termsVersion: CURRENT_TERMS_VERSION,
            // No referral capture on this path yet (see docs/roadmap.md
            // Phase 29's known limitation) — every company still needs its
            // own code to give out, though.
            referralCode: await this.referralService.generateUniqueCode(),
          });
    }

    // A Google login is proof the address is reachable — the same trust
    // Google itself already applied — so it also satisfies our own
    // (non-blocking) email-verification requirement if it hadn't been met.
    if (!user.emailVerifiedAt) {
      user = await this.userRepository.markEmailVerified(user.id);
    }

    const tokens = await this.issueTokens(user, true);
    return { user: toPublicUser(user), tokens };
  }

  // Native mobile counterpart to handleGoogleLogin above — Android's
  // Credential Manager (see frontend's GoogleNativeLoginService) never goes
  // through googleAuth/googleCallback's browser-redirect dance, since Google
  // actively blocks that redirect flow inside an embedded WebView. It
  // returns a Google-signed ID token straight to the app instead; this
  // verifies it server-side (signature, issuer, audience, expiry all
  // checked by verifyIdToken — never trust a client-supplied token as-is)
  // before reusing the exact same account-linking logic.
  async googleTokenLogin(idToken: string): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // verifyIdToken's own rejection reason (bad signature, expired token,
      // audience mismatch against this.googleClientId, ...) was previously
      // discarded entirely — nothing distinguished "client sent garbage"
      // from "our GOOGLE_CLIENT_ID/webClientId are out of sync" server-side.
      this.logger.warn(`Vérification du jeton Google échouée : ${String(error)}`);
      throw new UnauthorizedException('Jeton Google invalide.');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Jeton Google invalide.');
    }
    return this.handleGoogleLogin({ googleId: payload.sub, email: payload.email });
  }

  async handleAppleLogin(
    profile: AppleProfile,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    let user = await this.userRepository.findByAppleId(profile.appleId);
    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(profile.email);
      // Same email, first time via Apple: link rather than create a second
      // account for the same person — mirrors handleGoogleLogin exactly.
      user = existingByEmail
        ? await this.userRepository.linkAppleId(existingByEmail.id, profile.appleId)
        : await this.userRepository.createWithCompany({
            email: profile.email,
            appleId: profile.appleId,
            newsletterOptIn: false,
            termsAcceptedAt: new Date(),
            termsVersion: CURRENT_TERMS_VERSION,
            referralCode: await this.referralService.generateUniqueCode(),
          });
    }

    // Apple only ever asserts a *verified* email — same trust as Google's
    // own login satisfying our email-verification requirement.
    if (!user.emailVerifiedAt) {
      user = await this.userRepository.markEmailVerified(user.id);
    }

    const tokens = await this.issueTokens(user, true);
    return { user: toPublicUser(user), tokens };
  }

  // Native counterpart to Google's googleTokenLogin — see AppleNativeLoginService.
  // The identityToken is the only thing needed to log in; authorizationCode
  // (present on every native Apple sign-in, unlike name/email) is optional
  // and only used, best-effort, to capture a token this app can later
  // revoke on account deletion.
  async appleTokenLogin(
    identityToken: string,
    authorizationCode?: string,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    let payload: Awaited<ReturnType<typeof appleSignin.verifyIdToken>>;
    try {
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.appleClientId,
      });
    } catch (error) {
      this.logger.warn(`Vérification du jeton Apple échouée : ${String(error)}`);
      throw new UnauthorizedException('Jeton Apple invalide.');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Jeton Apple invalide.');
    }

    const result = await this.handleAppleLogin({ appleId: payload.sub, email: payload.email });

    if (
      authorizationCode &&
      this.appleTeamId &&
      this.appleKeyId &&
      this.applePrivateKey &&
      this.appEncryptionKey
    ) {
      // Never blocks or fails the login itself — see requestPasswordReset's
      // sibling comment above for the same "boots fine without it" posture.
      this.captureAppleRefreshToken(result.user.id, authorizationCode).catch((error: unknown) =>
        this.logger.warn(`Échec de la récupération du refresh token Apple : ${String(error)}`),
      );
    }

    return result;
  }

  private async captureAppleRefreshToken(userId: string, authorizationCode: string): Promise<void> {
    const clientSecret = appleSignin.getClientSecret({
      clientID: this.appleClientId!,
      teamID: this.appleTeamId!,
      keyIdentifier: this.appleKeyId!,
      privateKey: this.applePrivateKey!,
    });
    // No redirectUri for this exchange — this is a native device flow's
    // authorizationCode, which Apple's /auth/token endpoint doesn't tie to
    // one (that's only meaningful for a browser-redirect flow, which this
    // app doesn't have for Apple — see AuthService's class-level Apple
    // comment). The library types it as required regardless, so this is an
    // explicit empty value, not an oversight.
    const { refresh_token: refreshToken } = await appleSignin.getAuthorizationToken(
      authorizationCode,
      { clientID: this.appleClientId!, redirectUri: '', clientSecret },
    );
    if (!refreshToken) {
      return;
    }
    await this.userRepository.saveAppleRefreshToken(
      userId,
      encryptSecret(refreshToken, this.appEncryptionKey!),
    );
  }

  async refresh(rawRefreshToken: string | undefined): Promise<{
    user: PublicUser;
    tokens: IssuedTokens;
  }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }
    const existing = await this.refreshTokenRepository.findByHash(hashToken(rawRefreshToken));
    if (!existing) {
      throw new UnauthorizedException();
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException();
    }
    if (existing.revokedAt) {
      return this.handleReuse(existing);
    }
    return this.rotateFrom(existing);
  }

  // A revoked token being presented again. If it was revoked by a clean
  // rotation (replacedByTokenHash set — see rotateFrom) and we're still
  // within REFRESH_REUSE_GRACE_PERIOD_MS of that, this is almost certainly
  // the losing side of a same-instant race, not an attacker replaying a
  // leaked token: forgive it and rotate forward again rather than nuking
  // every session for the user. Anything else (revoked via logout, an
  // earlier theft-response nuke-all, or reuse long after rotation) is
  // treated as a genuinely stolen/leaked refresh token (see docs/roadmap.md
  // Phase 13).
  private async handleReuse(existing: RefreshToken): Promise<{
    user: PublicUser;
    tokens: IssuedTokens;
  }> {
    const withinGracePeriod =
      Date.now() - existing.revokedAt!.getTime() <= REFRESH_REUSE_GRACE_PERIOD_MS;
    if (existing.replacedByTokenHash && withinGracePeriod) {
      return this.rotateFrom(existing);
    }
    await this.refreshTokenRepository.revokeAllForUser(existing.userId);
    throw new UnauthorizedException();
  }

  // Always issues a fresh, persisted token pair for existing.userId — even
  // when called from handleReuse's grace-period path, where existing is
  // already revoked and the CAS below is a harmless no-op. The count from
  // revokeIfActiveWithReplacement is intentionally ignored: whether or not
  // this call is the one that flips existing.revokedAt, the caller walks
  // away with a valid session either way, so there is nothing to branch on
  // (see the module doc on replacedByTokenHash for why the revoke and the
  // pointer write must land together rather than as two separate calls).
  private async rotateFrom(existing: RefreshToken): Promise<{
    user: PublicUser;
    tokens: IssuedTokens;
  }> {
    const user = await this.userRepository.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const tokens = await this.issueTokens(user, existing.remembered);
    await this.refreshTokenRepository.revokeIfActiveWithReplacement(
      existing.id,
      hashToken(tokens.refreshToken),
    );
    return { user: toPublicUser(user), tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const existing = await this.refreshTokenRepository.findByHash(hashToken(rawRefreshToken));
    if (existing && !existing.revokedAt) {
      await this.refreshTokenRepository.revoke(existing.id);
    }
  }

  // Always succeeds from the caller's point of view regardless of whether
  // the email exists (see AuthController.forgotPassword) — the 503 below
  // fires uniformly for every call when unset, so it can never itself leak
  // account existence.
  async requestPasswordReset(email: string): Promise<void> {
    if (!this.systemSmtp) {
      throw new ServiceUnavailableException(
        "L'envoi d'email n'est pas configuré sur ce déploiement.",
      );
    }
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
      return;
    }
    await this.sendPasswordResetEmail(user);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const authToken = await this.consumeValidToken(dto.token, AuthTokenPurpose.PASSWORD_RESET);
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.updatePasswordHash(authToken.userId, passwordHash);
    // Standard post-reset hygiene: whoever held a still-live session before
    // the reset (including a possible attacker who triggered it) is logged
    // out everywhere.
    await this.refreshTokenRepository.revokeAllForUser(authToken.userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const authToken = await this.consumeValidToken(token, AuthTokenPurpose.EMAIL_VERIFICATION);
    const user = await this.userRepository.markEmailVerified(authToken.userId);

    // Best-effort: verifying the email must succeed regardless of what
    // happens to a pending referral reward (see docs/roadmap.md Phase 29 —
    // the reward is gated on this exact event as an anti-abuse measure).
    await this.referralService
      .grantRewardForVerifiedEmail(user.companyId)
      .catch((error: unknown) =>
        this.logger.warn(
          `Échec de l'attribution de la récompense de parrainage : ${String(error)}`,
        ),
      );
  }

  async resendVerification(userId: string): Promise<void> {
    if (!this.systemSmtp) {
      throw new ServiceUnavailableException(
        "L'envoi d'email n'est pas configuré sur ce déploiement.",
      );
    }
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }
    if (user.emailVerifiedAt) {
      return; // already verified — harmless no-op, not an error
    }
    await this.sendVerificationEmail(user);
  }

  async deleteAccount(userId: string, companyId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }
    if (user.passwordHash) {
      const valid = dto.password ? await bcrypt.compare(dto.password, user.passwordHash) : false;
      if (!valid) {
        throw new ForbiddenException('Mot de passe incorrect.');
      }
    }
    // Google-only accounts (no passwordHash) have nothing to re-confirm
    // with — the authenticated session + CSRF check already on this route
    // establish intent on their own.
    await this.revokeAppleTokenIfAny(user);
    await this.userRepository.deleteAccount(companyId);
  }

  // Apple's Sign in with Apple guidelines expect an app to revoke its grant
  // when the underlying account is deleted, not just stop using it — best-
  // effort and never blocks deletion: a revoke failure (Apple's endpoint
  // down, an already-expired refresh token, ...) would otherwise strand an
  // artisan mid-RGPD-deletion over a third party's own account bookkeeping.
  private async revokeAppleTokenIfAny(user: User): Promise<void> {
    if (
      !user.appleRefreshTokenEncrypted ||
      !this.appleClientId ||
      !this.appleTeamId ||
      !this.appleKeyId ||
      !this.applePrivateKey ||
      !this.appEncryptionKey
    ) {
      return;
    }
    try {
      const refreshToken = decryptSecret(user.appleRefreshTokenEncrypted, this.appEncryptionKey);
      const clientSecret = appleSignin.getClientSecret({
        clientID: this.appleClientId,
        teamID: this.appleTeamId,
        keyIdentifier: this.appleKeyId,
        privateKey: this.applePrivateKey,
      });
      await appleSignin.revokeAuthorizationToken(refreshToken, {
        clientID: this.appleClientId,
        clientSecret,
        tokenTypeHint: 'refresh_token',
      });
    } catch (error) {
      this.logger.warn(`Échec de la révocation du jeton Apple : ${String(error)}`);
    }
  }

  private async issueTokens(user: User, rememberMe: boolean): Promise<IssuedTokens> {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        companyId: user.companyId,
        role: user.role,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
      },
      { expiresIn: this.accessExpiresIn },
    );

    const rawRefreshToken = generateOpaqueToken();
    const days = rememberMe ? this.refreshExpiresInDays : this.refreshNotRememberedExpiresInDays;
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(
      user.id,
      hashToken(rawRefreshToken),
      refreshExpiresAt,
      rememberMe,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshExpiresAt,
      xsrfToken: generateOpaqueToken(),
      rememberMe,
    };
  }

  private async consumeValidToken(rawToken: string, purpose: AuthTokenPurpose) {
    const authToken = await this.authTokenRepository.findByHash(hashToken(rawToken));
    if (
      !authToken ||
      authToken.purpose !== purpose ||
      authToken.consumedAt ||
      authToken.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Lien invalide ou expiré.');
    }
    await this.authTokenRepository.consume(authToken.id);
    return authToken;
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    if (!this.systemSmtp || !this.systemMailFromAddress) {
      this.logger.warn('Email de vérification non envoyé : SYSTEM_SMTP_* non configuré.');
      return;
    }
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await this.authTokenRepository.create(
      user.id,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      hashToken(rawToken),
      expiresAt,
    );
    const link = `${this.frontendUrl}/verifier-email?token=${rawToken}`;
    await this.mailerService.send({
      smtp: this.systemSmtp,
      from: { name: this.systemMailFromName, address: this.systemMailFromAddress },
      to: user.email,
      subject: 'Confirmez votre adresse email — FactureLe',
      text: `Bienvenue sur FactureLe !\n\nConfirmez votre adresse email en suivant ce lien :\n${link}\n\nCe lien expire dans 24 heures.`,
    });
  }

  private async sendPasswordResetEmail(user: User): Promise<void> {
    if (!this.systemSmtp || !this.systemMailFromAddress) {
      this.logger.warn('Email de réinitialisation non envoyé : SYSTEM_SMTP_* non configuré.');
      return;
    }
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.authTokenRepository.create(
      user.id,
      AuthTokenPurpose.PASSWORD_RESET,
      hashToken(rawToken),
      expiresAt,
    );
    const link = `${this.frontendUrl}/reinitialiser-mot-de-passe?token=${rawToken}`;
    await this.mailerService.send({
      smtp: this.systemSmtp,
      from: { name: this.systemMailFromName, address: this.systemMailFromAddress },
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe — FactureLe',
      text: `Une réinitialisation de mot de passe a été demandée pour ce compte.\n\nSuivez ce lien pour choisir un nouveau mot de passe :\n${link}\n\nCe lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    });
  }
}
