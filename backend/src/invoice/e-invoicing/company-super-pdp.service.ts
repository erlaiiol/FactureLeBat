import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyRepository } from '../../company/company.repository';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto.util';
import { SuperPdpClientService } from './super-pdp-client.service';
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
}
