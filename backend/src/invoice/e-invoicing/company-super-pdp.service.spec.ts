import { ConfigService } from '@nestjs/config';
import { CompanyRepository } from '../../company/company.repository';
import { encryptSecret } from '../../common/secret-crypto.util';
import { CompanySuperPdpService } from './company-super-pdp.service';
import { SuperPdpClientService } from './super-pdp-client.service';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function buildService(
  options: {
    superPdpConfigured?: boolean;
    encryptionKeyConfigured?: boolean;
    storedTokens?: {
      superPdpAccessTokenEncrypted: string | null;
      superPdpRefreshTokenEncrypted: string | null;
      superPdpTokenExpiresAt: Date | null;
    };
    refreshResult?: { accessToken: string; refreshToken: string; expiresAt: Date };
  } = {},
) {
  const findSuperPdpTokens = jest.fn().mockResolvedValue(
    options.storedTokens ?? {
      superPdpAccessTokenEncrypted: null,
      superPdpRefreshTokenEncrypted: null,
      superPdpTokenExpiresAt: null,
    },
  );
  type SuperPdpTokenTriple = {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiresAt: Date;
  };
  const saveSuperPdpTokens = jest
    .fn<Promise<void>, [string, SuperPdpTokenTriple]>()
    .mockResolvedValue(undefined);
  const refreshSuperPdpTokens = jest
    .fn<Promise<void>, [string, string, SuperPdpTokenTriple]>()
    .mockResolvedValue(undefined);
  const isSuperPdpConnected = jest.fn().mockResolvedValue(true);
  const clearSuperPdpTokens = jest.fn().mockResolvedValue(undefined);
  const companyRepository = {
    findSuperPdpTokens,
    saveSuperPdpTokens,
    refreshSuperPdpTokens,
    isSuperPdpConnected,
    clearSuperPdpTokens,
  } as unknown as CompanyRepository;

  const isConfigured = jest.fn().mockReturnValue(options.superPdpConfigured ?? true);
  const refreshAccessToken = jest.fn().mockResolvedValue(
    options.refreshResult ?? {
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 3600_000),
    },
  );
  const exchangeAuthorizationCode = jest.fn().mockResolvedValue({
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const superPdpClient = {
    isConfigured,
    refreshAccessToken,
    exchangeAuthorizationCode,
    buildAuthorizationUrl: jest.fn(),
    verifyState: jest.fn(),
  } as unknown as SuperPdpClientService;

  const config = {
    get: jest
      .fn()
      .mockReturnValue(options.encryptionKeyConfigured === false ? undefined : ENCRYPTION_KEY),
  } as unknown as ConfigService;

  const service = new CompanySuperPdpService(companyRepository, superPdpClient, config);
  return {
    service,
    findSuperPdpTokens,
    saveSuperPdpTokens,
    refreshSuperPdpTokens,
    refreshAccessToken,
    exchangeAuthorizationCode,
  };
}

describe('CompanySuperPdpService', () => {
  describe('isConfigured', () => {
    it('requires both the SUPER PDP client credentials and an encryption key', () => {
      expect(buildService().service.isConfigured()).toBe(true);
      expect(buildService({ superPdpConfigured: false }).service.isConfigured()).toBe(false);
      expect(buildService({ encryptionKeyConfigured: false }).service.isConfigured()).toBe(false);
    });
  });

  describe('getValidAccessToken', () => {
    it('throws SuperPdpUnavailableError when this company never connected', async () => {
      const { service } = buildService();
      await expect(service.getValidAccessToken('company-1')).rejects.toThrow(
        SuperPdpUnavailableError,
      );
    });

    it('returns the decrypted access token without refreshing when it still has plenty of time left', async () => {
      const accessTokenEncrypted = encryptSecret('still-valid-access-token', ENCRYPTION_KEY);
      const refreshTokenEncrypted = encryptSecret('some-refresh-token', ENCRYPTION_KEY);
      const { service, refreshAccessToken } = buildService({
        storedTokens: {
          superPdpAccessTokenEncrypted: accessTokenEncrypted,
          superPdpRefreshTokenEncrypted: refreshTokenEncrypted,
          superPdpTokenExpiresAt: new Date(Date.now() + 3600_000), // 1h left
        },
      });

      const token = await service.getValidAccessToken('company-1');

      expect(token).toBe('still-valid-access-token');
      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes and persists a new token pair when the stored one is expiring soon', async () => {
      const accessTokenEncrypted = encryptSecret('about-to-expire', ENCRYPTION_KEY);
      const refreshTokenEncrypted = encryptSecret('the-refresh-token', ENCRYPTION_KEY);
      const { service, refreshAccessToken, refreshSuperPdpTokens } = buildService({
        storedTokens: {
          superPdpAccessTokenEncrypted: accessTokenEncrypted,
          superPdpRefreshTokenEncrypted: refreshTokenEncrypted,
          superPdpTokenExpiresAt: new Date(Date.now() + 1000), // 1s left, under the buffer
        },
        refreshResult: {
          accessToken: 'brand-new-access-token',
          refreshToken: 'brand-new-refresh-token',
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });

      const token = await service.getValidAccessToken('company-1');

      expect(refreshAccessToken).toHaveBeenCalledWith('the-refresh-token');
      expect(token).toBe('brand-new-access-token');
      expect(refreshSuperPdpTokens).toHaveBeenCalledTimes(1);
      const [calledCompanyId, calledPreviousRefreshToken, persistedArg] =
        refreshSuperPdpTokens.mock.calls[0];
      expect(calledCompanyId).toBe('company-1');
      expect(calledPreviousRefreshToken).toBe(refreshTokenEncrypted);
      expect(persistedArg.expiresAt).toBeInstanceOf(Date);
      // Never persisted in plaintext.
      expect(persistedArg.accessTokenEncrypted).not.toBe('brand-new-access-token');
    });

    it('dedupes concurrent refreshes for the same company into a single SUPER PDP call', async () => {
      const accessTokenEncrypted = encryptSecret('about-to-expire', ENCRYPTION_KEY);
      const refreshTokenEncrypted = encryptSecret('the-refresh-token', ENCRYPTION_KEY);
      const { service, refreshAccessToken } = buildService({
        storedTokens: {
          superPdpAccessTokenEncrypted: accessTokenEncrypted,
          superPdpRefreshTokenEncrypted: refreshTokenEncrypted,
          superPdpTokenExpiresAt: new Date(Date.now() + 1000),
        },
      });

      const [tokenA, tokenB] = await Promise.all([
        service.getValidAccessToken('company-1'),
        service.getValidAccessToken('company-1'),
      ]);

      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(tokenA).toBe(tokenB);
    });

    it('refreshes when no expiry was ever recorded (treated as already expired)', async () => {
      const { service, refreshAccessToken } = buildService({
        storedTokens: {
          superPdpAccessTokenEncrypted: encryptSecret('x', ENCRYPTION_KEY),
          superPdpRefreshTokenEncrypted: encryptSecret('y', ENCRYPTION_KEY),
          superPdpTokenExpiresAt: null,
        },
      });
      await service.getValidAccessToken('company-1');
      expect(refreshAccessToken).toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('encrypts both tokens before persisting them', async () => {
      const { service, saveSuperPdpTokens } = buildService();
      await service.handleCallback('company-1', 'auth-code-abc');

      expect(saveSuperPdpTokens).toHaveBeenCalledTimes(1);
      const [companyId, persisted] = saveSuperPdpTokens.mock.calls[0];
      expect(companyId).toBe('company-1');
      expect(persisted.accessTokenEncrypted).not.toBe('new-access-token');
      expect(persisted.refreshTokenEncrypted).not.toBe('new-refresh-token');
    });
  });
});
