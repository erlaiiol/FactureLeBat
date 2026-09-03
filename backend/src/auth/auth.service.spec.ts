import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import appleSignin from 'apple-signin-auth';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { AuthTokenPurpose, UserRole } from '../../generated/prisma/enums';
import { UserModel as User } from '../../generated/prisma/models';

// register/login/refresh/resetPassword all run real bcrypt (cost factor
// 12, see BCRYPT_SALT_ROUNDS) — deliberately, a mocked hash couldn't catch
// a real hashing/compare regression. A single real bcrypt op is normally
// well under jest's 5s default, but occasionally exceeds it under CPU
// contention (parallel workers, a loaded dev machine) — bumped instead of
// mocking away the thing these tests exist to catch.
jest.setTimeout(20_000);
import { encryptSecret } from '../common/secret-crypto.util';
import { MailerService } from '../mailer/mailer.service';
import { ReferralService } from '../referral/referral.service';
import { AuthService } from './auth.service';
import { AuthTokenRepository } from './repositories/auth-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { CreateUserWithCompanyData, UserRepository } from './repositories/user.repository';
import { hashToken } from './token.util';

const CONFIG_DEFAULTS: Record<string, unknown> = {
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: 30,
  JWT_REFRESH_NOT_REMEMBERED_EXPIRES_IN_DAYS: 1,
  FRONTEND_URL: 'http://localhost:4200',
  SYSTEM_MAIL_FROM_NAME: 'FactureLe',
};

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'artisan@example.com',
    passwordHash: null,
    googleId: null,
    appleId: null,
    appleRefreshTokenEncrypted: null,
    role: UserRole.ARTISAN,
    companyId: 'company-1',
    newsletterOptIn: false,
    termsAcceptedAt: new Date(),
    termsVersion: '1.0',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Hand-built fakes, same style as SourcingService.spec.ts/InvoiceMailService.spec.ts:
// plain jest.fn()s kept as named consts (so tests configure/assert on them
// directly, sidestepping the `jest.Mocked<T>` unbound-method lint trap),
// assembled into repository-shaped objects only via a final `as unknown as X` cast.
function buildService(configOverrides: Record<string, unknown> = {}) {
  const findByEmail = jest.fn();
  const findById = jest.fn();
  const findByGoogleId = jest.fn();
  const findByAppleId = jest.fn();
  const createWithCompany = jest.fn<Promise<User>, [CreateUserWithCompanyData]>();
  const linkGoogleId = jest.fn();
  const linkAppleId = jest.fn();
  const saveAppleRefreshToken = jest.fn();
  const updatePasswordHash = jest.fn();
  const markEmailVerified = jest.fn();
  const deleteAccountFn = jest.fn();
  const userRepository = {
    findByEmail,
    findById,
    findByGoogleId,
    findByAppleId,
    createWithCompany,
    linkGoogleId,
    linkAppleId,
    saveAppleRefreshToken,
    updatePasswordHash,
    markEmailVerified,
    deleteAccount: deleteAccountFn,
  } as unknown as UserRepository;

  const refreshCreate = jest.fn<Promise<unknown>, [string, string, Date, boolean]>();
  const refreshFindByHash = jest.fn();
  const refreshRevoke = jest.fn();
  const refreshRevokeIfActiveWithReplacement = jest.fn().mockResolvedValue(1);
  const refreshRevokeAllForUser = jest.fn();
  const refreshTokenRepository = {
    create: refreshCreate,
    findByHash: refreshFindByHash,
    revoke: refreshRevoke,
    revokeIfActiveWithReplacement: refreshRevokeIfActiveWithReplacement,
    revokeAllForUser: refreshRevokeAllForUser,
  } as unknown as RefreshTokenRepository;

  const authTokenCreate = jest.fn();
  const authTokenFindByHash = jest.fn();
  const authTokenConsume = jest.fn();
  const authTokenRepository = {
    create: authTokenCreate,
    findByHash: authTokenFindByHash,
    consume: authTokenConsume,
  } as unknown as AuthTokenRepository;

  const sign = jest.fn().mockReturnValue('signed.jwt.token');
  const jwtService = { sign } as unknown as JwtService;

  const send = jest.fn().mockResolvedValue(undefined);
  const mailerService = { send } as unknown as MailerService;

  const generateUniqueCode = jest.fn().mockResolvedValue('REFCODE1');
  const attributeReferral = jest.fn().mockResolvedValue(undefined);
  const grantRewardForVerifiedEmail = jest.fn().mockResolvedValue(undefined);
  const referralService = {
    generateUniqueCode,
    attributeReferral,
    grantRewardForVerifiedEmail,
  } as unknown as ReferralService;

  const configValues = { ...CONFIG_DEFAULTS, ...configOverrides };
  const configGet = jest.fn((key: string, fallback?: unknown) => configValues[key] ?? fallback);
  const config = { get: configGet } as unknown as ConfigService;

  const service = new AuthService(
    userRepository,
    refreshTokenRepository,
    authTokenRepository,
    jwtService,
    mailerService,
    referralService,
    config,
  );

  return {
    service,
    findByEmail,
    findById,
    findByGoogleId,
    findByAppleId,
    linkAppleId,
    saveAppleRefreshToken,
    createWithCompany,
    deleteAccountFn,
    updatePasswordHash,
    markEmailVerified,
    refreshCreate,
    refreshFindByHash,
    refreshRevoke,
    refreshRevokeIfActiveWithReplacement,
    refreshRevokeAllForUser,
    authTokenCreate,
    authTokenFindByHash,
    authTokenConsume,
    send,
    generateUniqueCode,
    attributeReferral,
    grantRewardForVerifiedEmail,
  };
}

describe('AuthService.register', () => {
  it('creates the user with a real bcrypt hash, auto-logs-in with a remembered session', async () => {
    const { service, findByEmail, createWithCompany, refreshCreate } = buildService();
    findByEmail.mockResolvedValue(null);
    createWithCompany.mockImplementation((data: { passwordHash?: string }) =>
      Promise.resolve(buildUser({ passwordHash: data.passwordHash })),
    );

    const result = await service.register({
      email: 'new@example.com',
      password: 'motdepasse123',
      acceptTerms: true,
    });

    expect(result.user.email).toBe('artisan@example.com');
    const [createCallArg] = createWithCompany.mock.calls[0];
    await expect(bcrypt.compare('motdepasse123', createCallArg.passwordHash!)).resolves.toBe(true);
    // Registration auto-logs-in as a remembered session — see
    // docs/roadmap.md Phase 13.
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      true,
    );
  });

  it('rejects a registration attempt for an email that already exists', async () => {
    const { service, findByEmail } = buildService();
    findByEmail.mockResolvedValue(buildUser());

    await expect(
      service.register({
        email: 'artisan@example.com',
        password: 'motdepasse123',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never blocks registration when the system mailer is unconfigured', async () => {
    const { service, findByEmail, createWithCompany, send } = buildService();
    findByEmail.mockResolvedValue(null);
    createWithCompany.mockResolvedValue(buildUser());

    await expect(
      service.register({ email: 'new@example.com', password: 'motdepasse123', acceptTerms: true }),
    ).resolves.toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  it('logs in with correct credentials and defaults to a remembered session', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, findByEmail, refreshCreate } = buildService();
    findByEmail.mockResolvedValue(buildUser({ passwordHash }));

    const result = await service.login({
      email: 'artisan@example.com',
      password: 'correct-password',
    });

    expect(result.user.id).toBe('user-1');
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      true,
    );
  });

  it('issues a short, non-remembered session when rememberMe is false', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, findByEmail, refreshCreate } = buildService();
    findByEmail.mockResolvedValue(buildUser({ passwordHash }));

    await service.login({
      email: 'artisan@example.com',
      password: 'correct-password',
      rememberMe: false,
    });

    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      false,
    );
    const [, , expiresAt] = refreshCreate.mock.calls[0];
    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeLessThan(2); // JWT_REFRESH_NOT_REMEMBERED_EXPIRES_IN_DAYS = 1
  });

  it('rejects an unknown email with a generic message', async () => {
    const { service, findByEmail } = buildService();
    findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'whatever123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a Google-only account attempting a password login', async () => {
    const { service, findByEmail } = buildService();
    findByEmail.mockResolvedValue(buildUser({ passwordHash: null, googleId: 'g-1' }));

    await expect(
      service.login({ email: 'artisan@example.com', password: 'whatever123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, findByEmail } = buildService();
    findByEmail.mockResolvedValue(buildUser({ passwordHash }));

    await expect(
      service.login({ email: 'artisan@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.googleTokenLogin', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies the ID token then logs into the linked account, same as the redirect flow', async () => {
    const { service, findByGoogleId, refreshCreate } = buildService({
      GOOGLE_CLIENT_ID: 'web-client-id',
    });
    const user = buildUser({ googleId: 'google-123', emailVerifiedAt: new Date() });
    findByGoogleId.mockResolvedValue(user);
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ sub: 'google-123', email: user.email }),
    } as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

    const result = await service.googleTokenLogin('raw-id-token');

    expect(result.user.email).toBe(user.email);
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      true,
    );
  });

  it('rejects a token that fails signature/audience verification', async () => {
    const { service } = buildService({ GOOGLE_CLIENT_ID: 'web-client-id' });
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('bad token'));

    await expect(service.googleTokenLogin('raw-id-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a verified token missing an email claim', async () => {
    const { service } = buildService({ GOOGLE_CLIENT_ID: 'web-client-id' });
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ sub: 'google-123' }),
    } as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

    await expect(service.googleTokenLogin('raw-id-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.appleTokenLogin', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies the identity token then logs into the linked account', async () => {
    const { service, findByAppleId, refreshCreate } = buildService({
      APPLE_CLIENT_ID: 'fr.facturele.app',
    });
    const user = buildUser({ appleId: 'apple-123', emailVerifiedAt: new Date() });
    findByAppleId.mockResolvedValue(user);
    jest
      .spyOn(appleSignin, 'verifyIdToken')
      .mockResolvedValue({ sub: 'apple-123', email: user.email } as Awaited<
        ReturnType<typeof appleSignin.verifyIdToken>
      >);

    const result = await service.appleTokenLogin('raw-identity-token');

    expect(result.user.email).toBe(user.email);
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      true,
    );
  });

  it('rejects a token that fails signature/audience verification', async () => {
    const { service } = buildService({ APPLE_CLIENT_ID: 'fr.facturele.app' });
    jest.spyOn(appleSignin, 'verifyIdToken').mockRejectedValue(new Error('bad token'));

    await expect(service.appleTokenLogin('raw-identity-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a verified token missing an email claim', async () => {
    const { service } = buildService({ APPLE_CLIENT_ID: 'fr.facturele.app' });
    jest
      .spyOn(appleSignin, 'verifyIdToken')
      .mockResolvedValue({ sub: 'apple-123' } as Awaited<
        ReturnType<typeof appleSignin.verifyIdToken>
      >);

    await expect(service.appleTokenLogin('raw-identity-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('never blocks login on a failed best-effort refresh-token capture', async () => {
    const { service, findByAppleId } = buildService({
      APPLE_CLIENT_ID: 'fr.facturele.app',
      APPLE_TEAM_ID: 'team-1',
      APPLE_KEY_ID: 'key-1',
      APPLE_PRIVATE_KEY: 'fake-key',
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });
    const user = buildUser({ appleId: 'apple-123', emailVerifiedAt: new Date() });
    findByAppleId.mockResolvedValue(user);
    jest
      .spyOn(appleSignin, 'verifyIdToken')
      .mockResolvedValue({ sub: 'apple-123', email: user.email } as Awaited<
        ReturnType<typeof appleSignin.verifyIdToken>
      >);
    jest.spyOn(appleSignin, 'getClientSecret').mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(
      service.appleTokenLogin('raw-identity-token', 'raw-authorization-code'),
    ).resolves.toBeDefined();
  });
});

describe('AuthService.refresh', () => {
  it('rotates a valid token and preserves its remembered flag', async () => {
    const {
      service,
      findById,
      refreshFindByHash,
      refreshRevokeIfActiveWithReplacement,
      refreshCreate,
    } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenHash: null,
      remembered: false,
      createdAt: new Date(),
    });
    findById.mockResolvedValue(buildUser());

    await service.refresh('raw-token');

    expect(refreshRevokeIfActiveWithReplacement).toHaveBeenCalledWith('rt-1', expect.any(String));
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      false, // remembered flag carried over from the rotated token
    );
  });

  it('forgives reuse of a just-rotated token within the grace period instead of nuking every session', async () => {
    // Two tabs racing the same pre-rotation token: the loser sees it
    // already revoked, but replacedByTokenHash proves it was a clean
    // rotation moments ago, not a stolen/replayed token.
    const { service, findById, refreshFindByHash, refreshRevokeAllForUser, refreshCreate } =
      buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 1_000), // rotated 1s ago
      replacedByTokenHash: 'some-other-hash',
      remembered: true,
      createdAt: new Date(),
    });
    findById.mockResolvedValue(buildUser());

    await service.refresh('raw-token');

    expect(refreshRevokeAllForUser).not.toHaveBeenCalled();
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      true,
    );
  });

  it('treats a replayed refresh token as a compromise signal once past the grace period and revokes every session', async () => {
    const { service, refreshFindByHash, refreshRevokeAllForUser } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 60_000), // rotated a minute ago — well past the grace period
      replacedByTokenHash: 'some-other-hash',
      remembered: true,
      createdAt: new Date(),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshRevokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('treats reuse of a token revoked without a replacement (logout, prior nuke-all) as a compromise signal', async () => {
    const { service, refreshFindByHash, refreshRevokeAllForUser } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(), // revoked moments ago, but not via a rotation
      replacedByTokenHash: null,
      remembered: true,
      createdAt: new Date(),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshRevokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects an expired refresh token', async () => {
    const { service, refreshFindByHash } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      remembered: true,
      createdAt: new Date(),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when no refresh token cookie is present', async () => {
    const { service } = buildService();
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.resetPassword', () => {
  it('updates the password and revokes every existing session', async () => {
    const {
      service,
      authTokenFindByHash,
      authTokenConsume,
      updatePasswordHash,
      refreshRevokeAllForUser,
    } = buildService();
    authTokenFindByHash.mockResolvedValue({
      id: 'at-1',
      userId: 'user-1',
      purpose: AuthTokenPurpose.PASSWORD_RESET,
      tokenHash: hashToken('reset-token'),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    });

    await service.resetPassword({ token: 'reset-token', newPassword: 'new-password-123' });

    expect(authTokenConsume).toHaveBeenCalledWith('at-1');
    expect(updatePasswordHash).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(refreshRevokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects an already-consumed token', async () => {
    const { service, authTokenFindByHash } = buildService();
    authTokenFindByHash.mockResolvedValue({
      id: 'at-1',
      userId: 'user-1',
      purpose: AuthTokenPurpose.PASSWORD_RESET,
      tokenHash: hashToken('reset-token'),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
      createdAt: new Date(),
    });

    await expect(
      service.resetPassword({ token: 'reset-token', newPassword: 'new-password-123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.deleteAccount', () => {
  it('deletes the account when the password matches', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, findById, deleteAccountFn } = buildService();
    findById.mockResolvedValue(buildUser({ passwordHash }));

    await service.deleteAccount('user-1', 'company-1', { password: 'correct-password' });

    expect(deleteAccountFn).toHaveBeenCalledWith('company-1');
  });

  it('rejects when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, findById, deleteAccountFn } = buildService();
    findById.mockResolvedValue(buildUser({ passwordHash }));

    await expect(
      service.deleteAccount('user-1', 'company-1', { password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteAccountFn).not.toHaveBeenCalled();
  });

  it('allows a Google-only account (no password set) to delete without confirming a password', async () => {
    const { service, findById, deleteAccountFn } = buildService();
    findById.mockResolvedValue(buildUser({ passwordHash: null, googleId: 'g-1' }));

    await service.deleteAccount('user-1', 'company-1', {});

    expect(deleteAccountFn).toHaveBeenCalledWith('company-1');
  });

  it('revokes the stored Apple grant before deleting an Apple-linked account', async () => {
    const { service, findById, deleteAccountFn } = buildService({
      APPLE_CLIENT_ID: 'fr.facturele.app',
      APPLE_TEAM_ID: 'team-1',
      APPLE_KEY_ID: 'key-1',
      APPLE_PRIVATE_KEY: 'fake-key',
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });
    const encrypted = encryptSecret('apple-refresh-token', Buffer.alloc(32).toString('base64'));
    findById.mockResolvedValue(
      buildUser({ passwordHash: null, appleId: 'apple-1', appleRefreshTokenEncrypted: encrypted }),
    );
    jest.spyOn(appleSignin, 'getClientSecret').mockReturnValue('client-secret');
    const revokeSpy = jest.spyOn(appleSignin, 'revokeAuthorizationToken').mockResolvedValue({});

    await service.deleteAccount('user-1', 'company-1', {});

    expect(revokeSpy).toHaveBeenCalledWith(
      'apple-refresh-token',
      expect.objectContaining({ clientID: 'fr.facturele.app', tokenTypeHint: 'refresh_token' }),
    );
    expect(deleteAccountFn).toHaveBeenCalledWith('company-1');
  });

  it('still deletes the account when Apple revocation fails', async () => {
    const { service, findById, deleteAccountFn } = buildService({
      APPLE_CLIENT_ID: 'fr.facturele.app',
      APPLE_TEAM_ID: 'team-1',
      APPLE_KEY_ID: 'key-1',
      APPLE_PRIVATE_KEY: 'fake-key',
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });
    const encrypted = encryptSecret('apple-refresh-token', Buffer.alloc(32).toString('base64'));
    findById.mockResolvedValue(
      buildUser({ passwordHash: null, appleId: 'apple-1', appleRefreshTokenEncrypted: encrypted }),
    );
    jest.spyOn(appleSignin, 'getClientSecret').mockImplementation(() => {
      throw new Error('boom');
    });

    await service.deleteAccount('user-1', 'company-1', {});

    expect(deleteAccountFn).toHaveBeenCalledWith('company-1');
  });
});
