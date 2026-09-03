import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeclarationFrequency, LegalStatus } from '../../../generated/prisma/enums';
import { CompanyRepository } from '../../company/company.repository';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto.util';
import { resolveSuperPdpVatRegime } from './super-pdp-vat-regime.util';
import {
  SuperPdpClientService,
  SuperPdpCompanyVerificationStatus,
} from './super-pdp-client.service';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';

// A token refreshed with less than this much time left is treated as
// already expired — avoids a request racing an about-to-expire token past
// SUPER PDP mid-call.
const REFRESH_BUFFER_MS = 60_000;

// Owns the artisan-facing side of the SUPER PDP connection: the OAuth2
// consent redirect, exchanging the returned code for tokens, encrypting
// them at rest (same AES-256-GCM primitive as Phase 12's SMTP password, see
// common/secret-crypto.util.ts), and transparently refreshing an expiring
// access token before every transmission call. SuperPdpClientService below
// only ever speaks raw SUPER PDP HTTP/OAuth2 — this is the layer that
// touches Company rows.
@Injectable()
export class CompanySuperPdpService {
  private readonly logger = new Logger(CompanySuperPdpService.name);
  private readonly encryptionKey?: string;
  // Dedupes concurrent refreshes for the same company within this process —
  // without it, two requests racing an about-to-expire token (e.g.
  // transmitting two invoices at once) would each call SUPER PDP's own
  // refresh endpoint with the same refresh token. SUPER PDP is OAuth2.1,
  // which favors single-use/rotating refresh tokens, so the loser of that
  // race would fail outright instead of just reusing the winner's result.
  // Single backend instance in this app's actual deployment (no replicas —
  // see infra/docker-compose.prod.yml), so an in-process Map is enough; a
  // multi-instance deployment would need this to live in the database
  // instead.
  private readonly refreshInFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly superPdpClient: SuperPdpClientService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>('APP_ENCRYPTION_KEY');
  }

  // Both the OAuth client credentials AND an encryption key are needed —
  // there'd be nothing safe to store the resulting tokens in otherwise, same
  // reasoning MailSettingsService already applies to APP_ENCRYPTION_KEY.
  isConfigured(): boolean {
    return this.superPdpClient.isConfigured() && Boolean(this.encryptionKey);
  }

  isConnected(companyId: string): Promise<boolean> {
    return this.companyRepository.isSuperPdpConnected(companyId);
  }

  buildConnectUrl(params: { companyId: string; email: string; siret: string }): string {
    this.requireConfigured();
    return this.superPdpClient.buildAuthorizationUrl(params);
  }

  // Delegated straight through — CompanySuperPdpController is the one place
  // that needs to check a callback's `state` before trusting its `code`.
  verifyState(state: string): string | null {
    return this.superPdpClient.verifyState(state);
  }

  async handleCallback(companyId: string, code: string): Promise<void> {
    this.requireConfigured();
    const tokens = await this.superPdpClient.exchangeAuthorizationCode(code);
    await this.companyRepository.saveSuperPdpTokens(companyId, {
      accessTokenEncrypted: encryptSecret(tokens.accessToken, this.encryptionKey!),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken, this.encryptionKey!),
      expiresAt: tokens.expiresAt,
    });
  }

  disconnect(companyId: string): Promise<void> {
    return this.companyRepository.clearSuperPdpTokens(companyId);
  }

  // Called right before every SUPER PDP API call (invoice submission, status
  // fetch) — returns a decrypted access token guaranteed to still be valid
  // for at least REFRESH_BUFFER_MS, refreshing it first if not.
  async getValidAccessToken(companyId: string): Promise<string> {
    this.requireConfigured();
    const row = await this.companyRepository.findSuperPdpTokens(companyId);
    if (!row.superPdpAccessTokenEncrypted || !row.superPdpRefreshTokenEncrypted) {
      throw new SuperPdpUnavailableError('This company has not connected SUPER PDP yet');
    }

    const expiresAt = row.superPdpTokenExpiresAt;
    const expiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
    if (!expiringSoon) {
      return decryptSecret(row.superPdpAccessTokenEncrypted, this.encryptionKey!);
    }

    const inFlight = this.refreshInFlight.get(companyId);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.refreshAndPersist(
      companyId,
      row.superPdpRefreshTokenEncrypted,
    ).finally(() => this.refreshInFlight.delete(companyId));
    this.refreshInFlight.set(companyId, refreshPromise);
    return refreshPromise;
  }

  private async refreshAndPersist(
    companyId: string,
    refreshTokenEncrypted: string,
  ): Promise<string> {
    const refreshToken = decryptSecret(refreshTokenEncrypted, this.encryptionKey!);
    const refreshed = await this.superPdpClient.refreshAccessToken(refreshToken);
    await this.companyRepository.refreshSuperPdpTokens(companyId, refreshTokenEncrypted, {
      accessTokenEncrypted: encryptSecret(refreshed.accessToken, this.encryptionKey!),
      refreshTokenEncrypted: encryptSecret(refreshed.refreshToken, this.encryptionKey!),
      expiresAt: refreshed.expiresAt,
    });
    return refreshed.accessToken;
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new SuperPdpUnavailableError('SUPER PDP is not configured on this deployment');
    }
  }

  // Phase 1.2-8 (2026 e-invoicing reform): CompanySuperPdpController's
  // GET /status reads this so the settings page can distinguish "connected,
  // SUPER PDP is still running its KYB check" from a genuinely broken
  // connection — null only when there's no connection to check at all.
  async getVerificationStatus(
    companyId: string,
  ): Promise<SuperPdpCompanyVerificationStatus | null> {
    if (!this.isConfigured() || !(await this.isConnected(companyId))) {
      return null;
    }
    const accessToken = await this.getValidAccessToken(companyId);
    const session = await this.superPdpClient.getSessionStatus(accessToken);
    return session.companyVerificationStatus;
  }

  // Phase 1.2-8 (2026 e-invoicing reform): the actual provisioning step a
  // fresh OAuth consent can't perform synchronously — SUPER PDP 403s every
  // route until its own KYB review verifies the session (see
  // super-pdp-client.service.ts's getSessionStatus comment), which can take
  // anywhere from minutes to days. Called by
  // SuperPdpProvisioningCronService for every company whose
  // superPdpDirectoryRegisteredAt is still null; safe to call repeatedly —
  // it only ever writes that column once the two real side effects (VAT
  // regime pushed, directory entry confirmed present) have both succeeded.
  async provisionCompany(company: {
    id: string;
    siret: string;
    legalStatus: LegalStatus;
    declarationFrequency: DeclarationFrequency;
    vatOnDebitsOption: boolean;
  }): Promise<'provisioned' | 'pending_verification'> {
    const accessToken = await this.getValidAccessToken(company.id);

    const session = await this.superPdpClient.getSessionStatus(accessToken);
    if (session.companyVerificationStatus !== 'verified') {
      return 'pending_verification';
    }

    await this.superPdpClient.updateVatRegime({
      accessToken,
      vatRegime: resolveSuperPdpVatRegime(company.legalStatus, company.declarationFrequency),
      hasVatOnDebits: company.vatOnDebitsOption,
    });

    await this.ensureDirectoryEntry(accessToken, company.siret, company.id);

    await this.companyRepository.markSuperPdpDirectoryRegistered(company.id);
    return 'provisioned';
  }

  // SIREN is the first 9 digits of the 14-digit SIRET — the identifier
  // format the real spec documents for the `ppf` directory (plain SIREN,
  // SIREN_SIRET, or SIREN_SUFFIXE; plain SIREN is the whole-legal-entity
  // form, the right one here). The `peppol` directory (sandbox only) uses
  // the spec's own documented example format, scheme `0225` + the same
  // 9-digit SIREN.
  private async ensureDirectoryEntry(
    accessToken: string,
    siret: string,
    companyId: string,
  ): Promise<void> {
    const siren = siret.slice(0, 9);
    if (siren.length < 9) {
      this.logger.warn(
        `Company ${companyId} has no usable SIRET, skipping SUPER PDP directory registration`,
      );
      return;
    }

    const { env } = await this.superPdpClient.getCurrentCompany(accessToken);
    const directory = env === 'production' ? 'ppf' : 'peppol';
    const identifier = directory === 'ppf' ? siren : `0225:${siren}`;

    const existingEntries = await this.superPdpClient.listDirectoryEntries(accessToken);
    const alreadyPublished = existingEntries.some(
      (entry) => entry.directory === directory && entry.identifier === identifier,
    );
    if (alreadyPublished) {
      return;
    }

    await this.superPdpClient.createDirectoryEntry({ accessToken, directory, identifier });
  }
}
