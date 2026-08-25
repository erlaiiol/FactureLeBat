import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch } from 'undici';
import { SuperPdpInvoiceEvent } from './super-pdp-status.util';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';

// Real, live OpenAPI spec confirmed 2026-08-23 at
// https://api.superpdp.tech/openapi/superpdp.json (v1.30.0.beta) — every
// path/param/schema referenced below is copied from that document, not
// guessed at. The authorizationUrl/tokenUrl in its BearerAuth security
// scheme are relative ("/oauth2/authorize"/"/oauth2/token"); OpenAPI leaves
// the base for a security scheme's URLs unspecified when relative, so this
// resolves them against the same api.superpdp.tech host the `servers` entry
// names — the standard, unsurprising reading, but flagged as unverified
// against a live call (no SUPER PDP account exists yet, see docs/roadmap.md
// Phase 1.2-4's own account-setup TODO).
const API_BASE_URL = 'https://api.superpdp.tech';
const OAUTH_AUTHORIZE_URL = `${API_BASE_URL}/oauth2/authorize`;
const OAUTH_TOKEN_URL = `${API_BASE_URL}/oauth2/token`;
const REQUEST_TIMEOUT_MS = 20_000;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — just long enough for a consent redirect round-trip

export interface SuperPdpTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface SuperPdpInvoice {
  id: number;
  events: SuperPdpInvoiceEvent[];
}

// Phase 1.2-5 (2026 e-invoicing reform): only the `en_invoice` (EN16931
// JSON) fields this app actually reads for the reception inbox — the real
// schema is the full EN16931 semantic model (seller/buyer/lines/vat_break_
// down/payment_instructions/…), deliberately not modeled here in full, same
// "narrow to what's used" choice already made for SuperPdpInvoice's own
// `events` above.
export interface SuperPdpIncomingInvoice {
  id: number;
  en_invoice?: {
    number?: string;
    issue_date?: string;
    currency_code?: string;
    seller?: {
      name?: string;
      legal_registration_identifier?: { value?: string; scheme?: string };
    };
    totals?: {
      total_with_vat?: string;
      total_vat_amount?: string;
    };
  };
}

interface SuperPdpInvoiceListResponse {
  data: SuperPdpIncomingInvoice[];
  count: number;
  has_before: boolean;
  has_after: boolean;
}

// Isolated from the rest of Phase 1.2-4 on purpose, same "isolate the risky
// external boundary" split as GroqClientService/StripeClientService: this
// class only ever knows about the raw SUPER PDP HTTP/OAuth2 calls
// (transport, auth, timeouts) — never Company rows, Invoice rows, or the
// ElectronicInvoicingProvider translation layer (see electronic-invoicing-
// provider.interface.ts/super-pdp-provider.service.ts for that).
// SUPERPDP_CLIENT_ID/SECRET are optional like GROQ_API_KEY (Phase 10): the
// app boots fine with neither set, every method here just throws
// SuperPdpUnavailableError.
@Injectable()
export class SuperPdpClientService {
  private readonly logger = new Logger(SuperPdpClientService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri: string;
  private readonly stateSigningSecret: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('SUPERPDP_CLIENT_ID');
    this.clientSecret = config.get<string>('SUPERPDP_CLIENT_SECRET');
    this.redirectUri = config.get<string>('SUPERPDP_REDIRECT_URI') ?? '';
    // Reusing JWT_ACCESS_SECRET (never optional, see env.validation.ts) to
    // sign the OAuth `state` param rather than introducing a second secret
    // env var or a DB round-trip just to protect a 10-minute-lived,
    // single-use redirect token — same "stateless, HMAC-signed, short
    // expiry" shape as this app's own JWTs, applied to a value that isn't
    // itself a session credential.
    this.stateSigningSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new SuperPdpUnavailableError(
        'SUPERPDP_CLIENT_ID/SUPERPDP_CLIENT_SECRET/SUPERPDP_REDIRECT_URI is not configured',
      );
    }
  }

  // Signs `${companyId}.${issuedAtMs}` with HMAC-SHA256 — verified on
  // callback (verifyState) before ever trusting the companyId it carries,
  // the same role a CSRF token plays for a same-origin form post.
  signState(companyId: string): string {
    const issuedAtMs = Date.now();
    const payload = `${companyId}.${issuedAtMs}`;
    const signature = createHmac('sha256', this.stateSigningSecret).update(payload).digest('hex');
    return `${payload}.${signature}`;
  }

  // Returns the companyId only if the signature is valid and the state
  // isn't older than OAUTH_STATE_MAX_AGE_MS — null on any failure (expired,
  // tampered, malformed), never throws, so the callback controller can
  // reply with a plain "expired, try again" rather than a 500.
  verifyState(state: string): string | null {
    const parts = state.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const [companyId, issuedAtMsStr, signature] = parts;
    const payload = `${companyId}.${issuedAtMsStr}`;
    const expectedSignature = createHmac('sha256', this.stateSigningSecret)
      .update(payload)
      .digest('hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }
    const issuedAtMs = Number(issuedAtMsStr);
    if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }
    return companyId;
  }

  // Where CompanySuperPdpController's connect endpoint redirects the
  // artisan's browser — `login_hint`/`superpdp_company_number(_scheme)` are
  // exactly the pre-fill query params SUPER PDP's own BearerAuth security
  // scheme documents for this flow (pre-fills their consent screen with the
  // artisan's email/SIRET so they aren't retyping it).
  buildAuthorizationUrl(params: { companyId: string; email: string; siret: string }): string {
    this.requireConfigured();
    const url = new URL(OAUTH_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId!);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', this.signState(params.companyId));
    url.searchParams.set('login_hint', params.email);
    url.searchParams.set('superpdp_company_number', params.siret);
    url.searchParams.set('superpdp_company_number_scheme', 'fr_siren');
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<SuperPdpTokens> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<SuperPdpTokens> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestTokens(bodyParams: Record<string, string>): Promise<SuperPdpTokens> {
    this.requireConfigured();
    const body = new URLSearchParams({
      ...bodyParams,
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
    });

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (error) {
      this.logger.warn(`SUPER PDP token request failed: ${String(error)}`);
      throw new SuperPdpUnavailableError('Unable to reach SUPER PDP');
    }

    if (!response.ok) {
      this.logger.warn(`SUPER PDP token request returned status ${response.status}`);
      throw new SuperPdpUnavailableError(`Unexpected status ${response.status} from SUPER PDP`);
    }

    let json: { access_token?: string; refresh_token?: string; expires_in?: number };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      throw new SuperPdpUnavailableError('Malformed SUPER PDP token response');
    }
    if (!json.access_token || !json.refresh_token || !json.expires_in) {
      throw new SuperPdpUnavailableError('Incomplete SUPER PDP token response');
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
    };
  }

  // POST /v1.beta/invoices — accepts the Factur-X PDF directly (confirmed in
  // the spec: `content: { "application/pdf": {} }`), placed in SUPER PDP's
  // own async processing queue. `externalId` is FactureLe's own Invoice.id,
  // round-tripped back on every event so this app never has to guess which
  // of its own invoices a given SUPER PDP event belongs to.
  async submitInvoice(params: {
    accessToken: string;
    pdfBuffer: Buffer;
    externalId: string;
  }): Promise<{ superPdpInvoiceId: string }> {
    this.requireConfigured();
    const url = new URL(`${API_BASE_URL}/v1.beta/invoices`);
    url.searchParams.set('external_id', params.externalId);

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          'content-type': 'application/pdf',
        },
        body: params.pdfBuffer,
      });
    } catch (error) {
      this.logger.warn(`SUPER PDP invoice submission failed: ${String(error)}`);
      throw new SuperPdpUnavailableError('Unable to reach SUPER PDP');
    }

    if (!response.ok) {
      this.logger.warn(`SUPER PDP invoice submission returned status ${response.status}`);
      throw new SuperPdpUnavailableError(`Unexpected status ${response.status} from SUPER PDP`);
    }

    let json: { id?: number };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      throw new SuperPdpUnavailableError('Malformed SUPER PDP invoice response');
    }
    if (json.id === undefined) {
      throw new SuperPdpUnavailableError('Incomplete SUPER PDP invoice response');
    }
    return { superPdpInvoiceId: String(json.id) };
  }

  // GET /v1.beta/invoices/{id} — the `events` array is what
  // super-pdp-status.util.ts's resolveTransmissionStatus/latestRejection
  // Reason read to compute FactureLe's own transmission status.
  async getInvoice(params: {
    accessToken: string;
    superPdpInvoiceId: string;
  }): Promise<SuperPdpInvoice> {
    this.requireConfigured();
    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(`${API_BASE_URL}/v1.beta/invoices/${params.superPdpInvoiceId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { authorization: `Bearer ${params.accessToken}` },
      });
    } catch (error) {
      this.logger.warn(`SUPER PDP invoice status fetch failed: ${String(error)}`);
      throw new SuperPdpUnavailableError('Unable to reach SUPER PDP');
    }

    if (!response.ok) {
      this.logger.warn(`SUPER PDP invoice status fetch returned status ${response.status}`);
      throw new SuperPdpUnavailableError(`Unexpected status ${response.status} from SUPER PDP`);
    }

    let json: SuperPdpInvoice;
    try {
      json = (await response.json()) as SuperPdpInvoice;
    } catch {
      throw new SuperPdpUnavailableError('Malformed SUPER PDP invoice response');
    }
    return json;
  }

  // GET /v1.beta/invoices?direction=in — Phase 1.2-5 (2026 e-invoicing
  // reform), the reception inbox's own sync source. `expand[]=en_invoice`/
  // `en_invoice.seller` pulls in the parsed EN16931 fields
  // ReceivedInvoiceService needs (issuer/number/date/totals) in the same
  // call, no per-invoice follow-up request. Sorted ascending by id (SUPER
  // PDP's own default) — `startingAfterId` lets the caller page forward
  // from the highest id already synced, so a repeated sync never re-reads
  // invoices it already has.
  async listIncomingInvoices(params: {
    accessToken: string;
    startingAfterId?: string;
  }): Promise<{ invoices: SuperPdpIncomingInvoice[]; hasAfter: boolean }> {
    this.requireConfigured();
    const url = new URL(`${API_BASE_URL}/v1.beta/invoices`);
    url.searchParams.set('direction', 'in');
    url.searchParams.append('expand[]', 'en_invoice');
    url.searchParams.append('expand[]', 'en_invoice.seller');
    url.searchParams.set('limit', '100');
    if (params.startingAfterId) {
      url.searchParams.set('starting_after_id', params.startingAfterId);
    }

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { authorization: `Bearer ${params.accessToken}` },
      });
    } catch (error) {
      this.logger.warn(`SUPER PDP incoming invoice list failed: ${String(error)}`);
      throw new SuperPdpUnavailableError('Unable to reach SUPER PDP');
    }

    if (!response.ok) {
      this.logger.warn(`SUPER PDP incoming invoice list returned status ${response.status}`);
      throw new SuperPdpUnavailableError(`Unexpected status ${response.status} from SUPER PDP`);
    }

    let json: SuperPdpInvoiceListResponse;
    try {
      json = (await response.json()) as SuperPdpInvoiceListResponse;
    } catch {
      throw new SuperPdpUnavailableError('Malformed SUPER PDP invoice list response');
    }
    return { invoices: json.data ?? [], hasAfter: json.has_after ?? false };
  }

  // GET /v1.beta/invoices/{id}?format=factur-x — the spec's own
  // recommendation for "a human readable version of the invoice",
  // regardless of what format the supplier originally sent (CII/UBL/raw
  // Factur-X) — SUPER PDP converts on the fly. Never cached/stored locally
  // (see ReceivedInvoice's own schema.prisma comment on why).
  async downloadInvoiceDocument(params: {
    accessToken: string;
    superPdpInvoiceId: string;
  }): Promise<Buffer> {
    this.requireConfigured();
    const url = new URL(`${API_BASE_URL}/v1.beta/invoices/${params.superPdpInvoiceId}`);
    url.searchParams.set('format', 'factur-x');

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { authorization: `Bearer ${params.accessToken}` },
      });
    } catch (error) {
      this.logger.warn(`SUPER PDP invoice document fetch failed: ${String(error)}`);
      throw new SuperPdpUnavailableError('Unable to reach SUPER PDP');
    }

    if (!response.ok) {
      this.logger.warn(`SUPER PDP invoice document fetch returned status ${response.status}`);
      throw new SuperPdpUnavailableError(`Unexpected status ${response.status} from SUPER PDP`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
