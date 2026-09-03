import { ConfigService } from '@nestjs/config';
import { DeclarationFrequency, LegalStatus } from '../../../generated/prisma/enums';
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
    sessionVerificationStatus?: 'verified' | 'needs_review' | 'failed';
    currentCompanyEnv?: 'sandbox' | 'production';
    existingDirectoryEntries?: { directory: 'peppol' | 'ppf'; identifier: string }[];
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
  const markSuperPdpDirectoryRegistered = jest.fn().mockResolvedValue(undefined);
  const companyRepository = {
    findSuperPdpTokens,
    saveSuperPdpTokens,
    refreshSuperPdpTokens,
    isSuperPdpConnected,
    clearSuperPdpTokens,
    markSuperPdpDirectoryRegistered,
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
  const getSessionStatus = jest.fn().mockResolvedValue({
    companyVerificationStatus: options.sessionVerificationStatus ?? 'verified',
  });
  const getCurrentCompany = jest
    .fn()
    .mockResolvedValue({ env: options.currentCompanyEnv ?? 'production' });
  const listDirectoryEntries = jest.fn().mockResolvedValue(options.existingDirectoryEntries ?? []);
  const createDirectoryEntry = jest.fn().mockResolvedValue(undefined);
  const updateVatRegime = jest.fn().mockResolvedValue(undefined);
  const superPdpClient = {
    isConfigured,
    refreshAccessToken,
    exchangeAuthorizationCode,
    buildAuthorizationUrl: jest.fn(),
    verifyState: jest.fn(),
    getSessionStatus,
    getCurrentCompany,
    listDirectoryEntries,
    createDirectoryEntry,
    updateVatRegime,
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
    isSuperPdpConnected,
    markSuperPdpDirectoryRegistered,
    getSessionStatus,
    getCurrentCompany,
    listDirectoryEntries,
    createDirectoryEntry,
    updateVatRegime,
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

  const validTokens = {
    superPdpAccessTokenEncrypted: encryptSecret('valid-access-token', ENCRYPTION_KEY),
    superPdpRefreshTokenEncrypted: encryptSecret('valid-refresh-token', ENCRYPTION_KEY),
    superPdpTokenExpiresAt: new Date(Date.now() + 3600_000),
  };

  describe('getVerificationStatus', () => {
    it('is null when not connected', async () => {
      const { service, isSuperPdpConnected } = buildService();
      isSuperPdpConnected.mockResolvedValue(false);
      expect(await service.getVerificationStatus('company-1')).toBeNull();
    });

    it('is null when SUPER PDP is not configured on this deployment', async () => {
      const { service } = buildService({ superPdpConfigured: false });
      expect(await service.getVerificationStatus('company-1')).toBeNull();
    });

    it('returns the session status from SUPER PDP when connected', async () => {
      const { service } = buildService({
        storedTokens: validTokens,
        sessionVerificationStatus: 'needs_review',
      });
      expect(await service.getVerificationStatus('company-1')).toBe('needs_review');
    });
  });

  describe('provisionCompany', () => {
    const company = {
      id: 'company-1',
      siret: '85332291500012',
      legalStatus: LegalStatus.COMPANY,
      declarationFrequency: DeclarationFrequency.TRIMESTRIELLE,
      vatOnDebitsOption: false,
    };

    it('stops at pending_verification without pushing VAT regime or a directory entry', async () => {
      const { service, updateVatRegime, createDirectoryEntry, markSuperPdpDirectoryRegistered } =
        buildService({ storedTokens: validTokens, sessionVerificationStatus: 'needs_review' });

      expect(await service.provisionCompany(company)).toBe('pending_verification');
      expect(updateVatRegime).not.toHaveBeenCalled();
      expect(createDirectoryEntry).not.toHaveBeenCalled();
      expect(markSuperPdpDirectoryRegistered).not.toHaveBeenCalled();
    });

    it('pushes the VAT regime, publishes a ppf directory entry with the SIREN, and marks provisioned once verified', async () => {
      const { service, updateVatRegime, createDirectoryEntry, markSuperPdpDirectoryRegistered } =
        buildService({
          storedTokens: validTokens,
          sessionVerificationStatus: 'verified',
          currentCompanyEnv: 'production',
        });

      expect(await service.provisionCompany(company)).toBe('provisioned');
      expect(updateVatRegime).toHaveBeenCalledWith({
        accessToken: 'valid-access-token',
        vatRegime: 'quarterly',
        hasVatOnDebits: false,
      });
      expect(createDirectoryEntry).toHaveBeenCalledWith({
        accessToken: 'valid-access-token',
        directory: 'ppf',
        identifier: '853322915',
      });
      expect(markSuperPdpDirectoryRegistered).toHaveBeenCalledWith('company-1');
    });

    it('targets the peppol directory with the spec-documented scheme in sandbox', async () => {
      const { service, createDirectoryEntry } = buildService({
        storedTokens: validTokens,
        sessionVerificationStatus: 'verified',
        currentCompanyEnv: 'sandbox',
      });

      await service.provisionCompany(company);
      expect(createDirectoryEntry).toHaveBeenCalledWith({
        accessToken: 'valid-access-token',
        directory: 'peppol',
        identifier: '0225:853322915',
      });
    });

    it('never creates a duplicate directory entry when one already exists', async () => {
      const { service, createDirectoryEntry, markSuperPdpDirectoryRegistered } = buildService({
        storedTokens: validTokens,
        sessionVerificationStatus: 'verified',
        currentCompanyEnv: 'production',
        existingDirectoryEntries: [{ directory: 'ppf', identifier: '853322915' }],
      });

      expect(await service.provisionCompany(company)).toBe('provisioned');
      expect(createDirectoryEntry).not.toHaveBeenCalled();
      expect(markSuperPdpDirectoryRegistered).toHaveBeenCalledWith('company-1');
    });

    it('resolves vat_exemption for a micro-entrepreneur regardless of declaration frequency', async () => {
      const { service, updateVatRegime } = buildService({
        storedTokens: validTokens,
        sessionVerificationStatus: 'verified',
      });

      await service.provisionCompany({ ...company, legalStatus: LegalStatus.MICRO_ENTREPRENEUR });
      expect(updateVatRegime).toHaveBeenCalledWith(
        expect.objectContaining({ vatRegime: 'vat_exemption' }),
      );
    });

    it('skips directory registration but still completes when the SIRET is unusably short', async () => {
      const { service, createDirectoryEntry, markSuperPdpDirectoryRegistered } = buildService({
        storedTokens: validTokens,
        sessionVerificationStatus: 'verified',
      });

      expect(await service.provisionCompany({ ...company, siret: '1234' })).toBe('provisioned');
      expect(createDirectoryEntry).not.toHaveBeenCalled();
      expect(markSuperPdpDirectoryRegistered).toHaveBeenCalledWith('company-1');
    });
  });
});
