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
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { AuthTokenPurpose } from '../../generated/prisma/enums';
import { UserModel as User } from '../../generated/prisma/models';
import { SmtpCredentials } from '../mail-settings/entities/mail-settings.entity';
import { MailerService } from '../mailer/mailer.service';
import {
  BCRYPT_SALT_ROUNDS,
  CURRENT_TERMS_VERSION,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants';
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

  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    config: ConfigService,
  ) {
    this.accessExpiresIn = config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as StringValue;
    this.refreshExpiresInDays = config.get<number>('JWT_REFRESH_EXPIRES_IN_DAYS', 30);
    this.refreshNotRememberedExpiresInDays = config.get<number>(
      'JWT_REFRESH_NOT_REMEMBERED_EXPIRES_IN_DAYS',
      1,
    );
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
    this.systemMailFromName = config.get<string>('SYSTEM_MAIL_FROM_NAME', 'FactureLeBat');

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
  }

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.userRepository.createWithCompany({
      email: dto.email,
      passwordHash,
      newsletterOptIn: dto.newsletterOptIn ?? false,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    });

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
    if (existing.revokedAt) {
      // Replay of an already-rotated token: treated as a stolen/leaked
      // refresh token — nuke every session for this user, not just this
      // one (see docs/roadmap.md Phase 13).
      await this.refreshTokenRepository.revokeAllForUser(existing.userId);
      throw new UnauthorizedException();
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException();
    }

    await this.refreshTokenRepository.revoke(existing.id);
    const user = await this.userRepository.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const tokens = await this.issueTokens(user, existing.remembered);
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
    await this.userRepository.markEmailVerified(authToken.userId);
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
    await this.userRepository.deleteAccount(companyId);
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
      subject: 'Confirmez votre adresse email — FactureLeBat',
      text: `Bienvenue sur FactureLeBat !\n\nConfirmez votre adresse email en suivant ce lien :\n${link}\n\nCe lien expire dans 24 heures.`,
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
      subject: 'Réinitialisation de votre mot de passe — FactureLeBat',
      text: `Une réinitialisation de mot de passe a été demandée pour ce compte.\n\nSuivez ce lien pour choisir un nouveau mot de passe :\n${link}\n\nCe lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    });
  }
}
