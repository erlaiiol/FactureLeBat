// Phase 1.2-4: same "isolate the risky external boundary, throw one typed
// error the caller can catch" precedent as GroqUnavailableError/
// StripeUnavailableError — thrown for both "not configured on this
// deployment" and "the SUPER PDP API call itself failed" (transport error,
// non-2xx, malformed response, expired/invalid tokens).
export class SuperPdpUnavailableError extends Error {}
