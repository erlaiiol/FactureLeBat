import { randomBytes } from 'crypto';

// Short-lived CSRF defense for the two hand-rolled Apple authorize/callback
// round-trips (web + Android bridge) — passport-google-oauth20 does the
// equivalent `state` generation/validation internally for Google, but there
// is no Passport strategy for Apple's Services ID flow here, so it's done by
// hand: a random value in an httpOnly cookie the callback must see echoed
// back in Apple's own form_post body.
export const APPLE_OAUTH_STATE_COOKIE = 'apple_oauth_state';
export const APPLE_OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

export function generateAppleOAuthState(): string {
  return randomBytes(16).toString('hex');
}

const APPLE_AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';

// response_type includes id_token, so Apple mandates response_mode=form_post
// (a plain query-string redirect isn't allowed for that combination) — see
// AuthController.appleCallback/appleMobileCallback, the two POST routes this
// forces into existence.
export function buildAppleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(APPLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code id_token');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'email name');
  url.searchParams.set('state', params.state);
  return url.toString();
}
