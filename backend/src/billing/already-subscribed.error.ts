// Thrown when a checkout session is requested for a company that already
// has a subscription in Stripe (ACTIVE or PAST_DUE) — creating a second
// subscription on the same customer would bill the artisan twice for the
// same service instead of fixing the existing one. Mapped to a 400 by
// BillingController; PAST_DUE should go through the billing portal
// (update payment method) instead.
export class AlreadySubscribedError extends Error {}
