import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthTokenPurpose, UserRole } from '../../generated/prisma/enums';
import { UserModel as User } from '../../generated/prisma/models';
import { MailerService } from '../mailer/mailer.service';
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
  SYSTEM_MAIL_FROM_NAME: 'FactureLeBat',
};

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'artisan@example.com',
    passwordHash: null,
    googleId: null,
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
  const createWithCompany = jest.fn<Promise<User>, [CreateUserWithCompanyData]>();
  const linkGoogleId = jest.fn();
  const updatePasswordHash = jest.fn();
  const markEmailVerified = jest.fn();
  const deleteAccountFn = jest.fn();
  const userRepository = {
    findByEmail,
    findById,
    findByGoogleId,
    createWithCompany,
    linkGoogleId,
    updatePasswordHash,
    markEmailVerified,
    deleteAccount: deleteAccountFn,
  } as unknown as UserRepository;

  const refreshCreate = jest.fn<Promise<unknown>, [string, string, Date, boolean]>();
  const refreshFindByHash = jest.fn();
  const refreshRevoke = jest.fn();
  const refreshRevokeAllForUser = jest.fn();
  const refreshTokenRepository = {
    create: refreshCreate,
    findByHash: refreshFindByHash,
    revoke: refreshRevoke,
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

  const configValues = { ...CONFIG_DEFAULTS, ...configOverrides };
  const configGet = jest.fn((key: string, fallback?: unknown) => configValues[key] ?? fallback);
  const config = { get: configGet } as unknown as ConfigService;

  const service = new AuthService(
    userRepository,
    refreshTokenRepository,
    authTokenRepository,
    jwtService,
    mailerService,
    config,
  );

  return {
    service,
    findByEmail,
    findById,
    createWithCompany,
    deleteAccountFn,
    updatePasswordHash,
    markEmailVerified,
    refreshCreate,
    refreshFindByHash,
    refreshRevoke,
    refreshRevokeAllForUser,
    authTokenCreate,
    authTokenFindByHash,
    authTokenConsume,
    send,
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

describe('AuthService.refresh', () => {
  it('rotates a valid token and preserves its remembered flag', async () => {
    const { service, findById, refreshFindByHash, refreshRevoke, refreshCreate } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      remembered: false,
      createdAt: new Date(),
    });
    findById.mockResolvedValue(buildUser());

    await service.refresh('raw-token');

    expect(refreshRevoke).toHaveBeenCalledWith('rt-1');
    expect(refreshCreate).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      false, // remembered flag carried over from the rotated token
    );
  });

  it('treats a replayed (already-revoked) refresh token as a compromise signal and revokes every session', async () => {
    const { service, refreshFindByHash, refreshRevokeAllForUser } = buildService();
    refreshFindByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(), // already rotated once — this is a replay
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
});
