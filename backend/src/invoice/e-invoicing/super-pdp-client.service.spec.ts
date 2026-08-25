import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SuperPdpClientService } from './super-pdp-client.service';

function buildService(overrides: Record<string, string> = {}) {
  const env: Record<string, string> = {
    JWT_ACCESS_SECRET: 'test-jwt-secret',
    SUPERPDP_CLIENT_ID: 'client-123',
    SUPERPDP_CLIENT_SECRET: 'secret-456',
    SUPERPDP_REDIRECT_URI: 'http://localhost:3000/api/company/super-pdp/callback',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
  return new SuperPdpClientService(config);
}

describe('SuperPdpClientService', () => {
  describe('isConfigured', () => {
    it('is true when client id, secret and redirect uri are all set', () => {
      expect(buildService().isConfigured()).toBe(true);
    });

    it('is false when SUPERPDP_CLIENT_ID is missing', () => {
      expect(buildService({ SUPERPDP_CLIENT_ID: '' }).isConfigured()).toBe(false);
    });

    it('is false when SUPERPDP_CLIENT_SECRET is missing', () => {
      expect(buildService({ SUPERPDP_CLIENT_SECRET: '' }).isConfigured()).toBe(false);
    });
  });

  describe('signState / verifyState', () => {
    it('round-trips: a freshly signed state verifies back to the same companyId', () => {
      const service = buildService();
      const state = service.signState('company-42');
      expect(service.verifyState(state)).toBe('company-42');
    });

    it('rejects a tampered companyId (signature no longer matches)', () => {
      const service = buildService();
      const state = service.signState('company-42');
      const [, issuedAt, signature] = state.split('.');
      const tampered = `company-attacker.${issuedAt}.${signature}`;
      expect(service.verifyState(tampered)).toBeNull();
    });

    it('rejects a tampered signature', () => {
      const service = buildService();
      const state = service.signState('company-42');
      const tampered = state.slice(0, -4) + 'beef';
      expect(service.verifyState(tampered)).toBeNull();
    });

    it('rejects a state signed with a different secret (e.g. a stale deploy)', () => {
      const signed = buildService({ JWT_ACCESS_SECRET: 'secret-a' }).signState('company-42');
      const verifier = buildService({ JWT_ACCESS_SECRET: 'secret-b' });
      expect(verifier.verifyState(signed)).toBeNull();
    });

    it('rejects a malformed state (wrong number of parts)', () => {
      expect(buildService().verifyState('not.a.valid.state.token')).toBeNull();
      expect(buildService().verifyState('too-few-parts')).toBeNull();
    });

    it('rejects an expired state (older than the 10-minute window)', () => {
      const service = buildService();
      const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
      const payload = `company-42.${elevenMinutesAgo}`;
      // Re-derive the same signature the service itself would have produced
      // at that timestamp, so only the age (not the signature) is being
      // exercised by this test.
      const signature = createHmac('sha256', 'test-jwt-secret').update(payload).digest('hex');
      expect(service.verifyState(`${payload}.${signature}`)).toBeNull();
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('includes the required OAuth2 + SUPER PDP pre-fill query params', () => {
      const service = buildService();
      const url = new URL(
        service.buildAuthorizationUrl({
          companyId: 'company-42',
          email: 'artisan@example.fr',
          siret: '12345678900012',
        }),
      );
      expect(url.origin + url.pathname).toBe('https://api.superpdp.tech/oauth2/authorize');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('client-123');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/api/company/super-pdp/callback',
      );
      expect(url.searchParams.get('login_hint')).toBe('artisan@example.fr');
      expect(url.searchParams.get('superpdp_company_number')).toBe('12345678900012');
      expect(url.searchParams.get('superpdp_company_number_scheme')).toBe('fr_siren');
      expect(service.verifyState(url.searchParams.get('state')!)).toBe('company-42');
    });

    it('throws SuperPdpUnavailableError when not configured', () => {
      const service = buildService({ SUPERPDP_CLIENT_ID: '' });
      expect(() =>
        service.buildAuthorizationUrl({ companyId: 'c1', email: 'a@b.fr', siret: '123' }),
      ).toThrow(
        'SUPERPDP_CLIENT_ID/SUPERPDP_CLIENT_SECRET/SUPERPDP_REDIRECT_URI is not configured',
      );
    });
  });
});
