// Single error type for every way Stripe can be unreachable/unconfigured —
// same "one error type, one generic client-facing message" posture as
// GroqUnavailableError/ProductImportUnavailableError. Mapped to a 503 by
// whichever BillingService/AdminService method catches it.
export class StripeUnavailableError extends Error {}
