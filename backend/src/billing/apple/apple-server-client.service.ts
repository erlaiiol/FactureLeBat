import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { PlanTier } from '../../../generated/prisma/enums';
import { PLAN_TIER_ORDER } from '../plan-config';
import { AppleUnavailableError } from './apple-unavailable.error';

const PRODUCT_ID_ENV_KEY_BY_TIER: Record<PlanTier, string> = {
  [PlanTier.ESSENTIEL]: 'APPLE_PRODUCT_ID_ESSENTIEL',
  [PlanTier.PRO]: 'APPLE_PRODUCT_ID_PRO',
  [PlanTier.PREMIUM]: 'APPLE_PRODUCT_ID_PREMIUM',
};

// DER-encoded, publicly published by Apple (https://www.apple.com/
// certificateauthority/) — not a secret, checked into the repo like any
// other static asset. Both roots are bundled because a transaction/
// notification JWS's certificate chain can terminate at either one
// depending on when it was issued; SignedDataVerifier tries all of them.
const APPLE_ROOT_CERTIFICATES = [
  readFileSync(join(__dirname, 'certs/AppleRootCA-G3.cer')),
  readFileSync(join(__dirname, 'certs/AppleIncRootCertificate.cer')),
];

// Isolated from BillingService on purpose, same "isolate the risky external
// boundary" split as StripeClientService — this class only ever knows about
// the raw App Store Server Library calls (JWS verification, the Server
// API), never Company rows or plan-access rules. Every credential here is
// optional, same "the app boots fine with none of them set" posture Stripe
// already has: every method just throws AppleUnavailableError until
// configured. See docs/1.7/1.7-1-app-store-connect-prerequisites.md for
// where each of these values comes from.
@Injectable()
export class AppleServerClientService {
  private readonly logger = new Logger(AppleServerClientService.name);
  private readonly productIdByTier: Partial<Record<PlanTier, string>> = {};
  private readonly tierByProductId = new Map<string, PlanTier>();
  private readonly prodVerifier?: SignedDataVerifier;
  private readonly sandboxVerifier?: SignedDataVerifier;
  // A transaction produced by a local StoreKit Configuration file (Xcode's
  // offline purchase-sheet testing, no real Apple servers involved) is
  // signed with a local test certificate chain, distinct from both
  // Production's and Sandbox's real Apple-issued ones — Environment.XCODE
  // is a third, separate verifier for exactly that case. Without it, every
  // purchase made against a `.storekit` Configuration file would fail
  // verify-purchase even though the native purchase itself succeeded.
  private readonly xcodeVerifier?: SignedDataVerifier;
  private readonly prodApiClient?: AppStoreServerAPIClient;
  private readonly sandboxApiClient?: AppStoreServerAPIClient;

  constructor(config: ConfigService) {
    // Reuses Phase 1.5's APPLE_CLIENT_ID, already set to this app's bundle
    // id at deploy time ("APPLE_CLIENT_ID at deploy time is just the bundle
    // id" — see docs/roadmap.md Phase 1.5) rather than introducing a second,
    // redundant env var for the same value.
    const bundleId = config.get<string>('APPLE_CLIENT_ID');
    const keyId = config.get<string>('APPLE_IAP_KEY_ID');
    const issuerId = config.get<string>('APPLE_IAP_ISSUER_ID');
    // Same literal-\n-escaped-PEM handling as AuthService's APPLE_PRIVATE_KEY
    // — this is a *different* key (the App Store Server API key, not the
    // Sign in with Apple key), deliberately not sharing an env var name with
    // it. See docs/1.7/1.7-2-backend-apple-purchase-verification.md.
    const rawPrivateKey = config.get<string>('APPLE_IAP_PRIVATE_KEY');
    const privateKey = rawPrivateKey?.replace(/\\n/g, '\n');
    const appAppleIdRaw = config.get<string>('APPLE_APP_ID');
    const appAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : undefined;

    for (const tier of PLAN_TIER_ORDER) {
      const productId = config.get<string>(PRODUCT_ID_ENV_KEY_BY_TIER[tier]);
      if (productId) {
        this.productIdByTier[tier] = productId;
        this.tierByProductId.set(productId, tier);
      }
    }

    // appAppleId is not actually optional in practice, despite the library's
    // own doc comment on SignedDataVerifier's constructor reading as if it
    // were ("omitted in the sandbox environment") — confirmed by running
    // it: the Production SignedDataVerifier's constructor throws
    // synchronously ("appAppleId is required when the environment is
    // Production") if it's missing, which would crash this service's own
    // construction and take the whole Nest app down with it. Folded into
    // the same all-or-nothing gate as the other 4 values instead of trying
    // to run Sandbox-only until it's known — same safe-unconfigured
    // fallback every other optional credential in this app already has.
    if (bundleId && keyId && issuerId && privateKey && appAppleId) {
      // enableOnlineChecks: true — OCSP revocation checking against Apple's
      // network on every verification, same "correct over fast" choice
      // Apple's own library documentation recommends. Both environments'
      // verifiers are always built together (see verifyWithFallback below):
      // a live production app's users may be Sandbox testers (TestFlight)
      // or genuine App Store purchasers at the same time, and the JWS alone
      // doesn't say which up front.
      this.prodVerifier = new SignedDataVerifier(
        APPLE_ROOT_CERTIFICATES,
        true,
        Environment.PRODUCTION,
        bundleId,
        appAppleId,
      );
      this.sandboxVerifier = new SignedDataVerifier(
        APPLE_ROOT_CERTIFICATES,
        true,
        Environment.SANDBOX,
        bundleId,
        appAppleId,
      );
      this.xcodeVerifier = new SignedDataVerifier(
        APPLE_ROOT_CERTIFICATES,
        true,
        Environment.XCODE,
        bundleId,
        appAppleId,
      );
      this.prodApiClient = new AppStoreServerAPIClient(
        privateKey,
        keyId,
        issuerId,
        bundleId,
        Environment.PRODUCTION,
      );
      this.sandboxApiClient = new AppStoreServerAPIClient(
        privateKey,
        keyId,
        issuerId,
        bundleId,
        Environment.SANDBOX,
      );
    } else {
      this.logger.warn(
        'Apple IAP is not fully configured (APPLE_CLIENT_ID/APPLE_IAP_KEY_ID/APPLE_IAP_ISSUER_ID/APPLE_IAP_PRIVATE_KEY/APPLE_APP_ID) — every AppleServerClientService method will throw AppleUnavailableError.',
      );
    }
  }

  // Billing subsystem operational at all — same shape as
  // StripeClientService.isConfigured (credentials present AND at least one
  // tier's product id configured).
  isConfigured(): boolean {
    return Boolean(this.prodVerifier && Object.keys(this.productIdByTier).length > 0);
  }

  // Resolves a purchased product id back to one of our 3 tiers — null if it
  // doesn't match any configured tier (never guessed at in that case), same
  // posture as StripeClientService.resolveTierFromPriceId.
  resolveTierFromProductId(productId: string | undefined): PlanTier | null {
    return productId ? (this.tierByProductId.get(productId) ?? null) : null;
  }

  // The inverse of resolveTierFromProductId — GET /billing/plans exposes
  // this per tier so the frontend's iOS purchase buttons never hardcode a
  // product id, same reasoning StripeClientService.isTierAvailable already
  // has for the Stripe side.
  productIdForTier(tier: PlanTier): string | null {
    return this.productIdByTier[tier] ?? null;
  }

  async verifyTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload> {
    return this.verifyWithFallback((verifier) =>
      verifier.verifyAndDecodeTransaction(signedTransactionInfo),
    );
  }

  async verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
    return this.verifyWithFallback((verifier) =>
      verifier.verifyAndDecodeNotification(signedPayload),
    );
  }

  // Tries Production first (the common case once this app is live on the
  // App Store), then Sandbox, then Xcode (local StoreKit Configuration file
  // testing) — each step only on the specific "this JWS wasn't signed for
  // the environment I asked about" failure, never on any other verification
  // error, which must still surface as a real failure. Xcode tried last
  // since it only ever applies during local development, never to a real
  // user's transaction.
  private async verifyWithFallback<T>(
    run: (verifier: SignedDataVerifier) => Promise<T>,
  ): Promise<T> {
    if (!this.prodVerifier || !this.sandboxVerifier || !this.xcodeVerifier) {
      throw new AppleUnavailableError('Apple IAP is not configured on this deployment');
    }
    for (const verifier of [this.prodVerifier, this.sandboxVerifier]) {
      try {
        return await run(verifier);
      } catch (error) {
        if (
          !(error instanceof VerificationException) ||
          error.status !== VerificationStatus.INVALID_ENVIRONMENT
        ) {
          throw error;
        }
      }
    }
    return run(this.xcodeVerifier);
  }

  // Lets an admin/ops action (not built here, see docs/1.7's non-goals)
  // confirm the notification webhook URL is actually reachable from Apple's
  // side — kept here for that future use and for manual verification during
  // 1.7-1's App Store Connect setup, same reasoning
  // StripeClientService exposes raw SDK capability even where BillingService
  // doesn't yet have a route calling it.
  async requestTestNotification(): Promise<void> {
    const client = this.prodApiClient ?? this.sandboxApiClient;
    if (!client) {
      throw new AppleUnavailableError('Apple IAP is not configured on this deployment');
    }
    await client.requestTestNotification();
  }
}
