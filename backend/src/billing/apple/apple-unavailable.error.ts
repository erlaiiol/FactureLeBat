// Single error type for every way Apple's IAP verification can be
// unreachable/unconfigured — mirrors StripeUnavailableError exactly, same
// "one error type, one generic client-facing message" posture. Mapped to a
// 503 by whichever BillingService method catches it.
export class AppleUnavailableError extends Error {}
