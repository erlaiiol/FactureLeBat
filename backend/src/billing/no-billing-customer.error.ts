// Thrown when a portal session is requested for a company that has never
// started a Stripe checkout (no stripeCustomerId yet) — there is nothing
// to manage. Mapped to a 400 by BillingController.
export class NoBillingCustomerError extends Error {}
