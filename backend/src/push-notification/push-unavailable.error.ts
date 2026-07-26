// Single error type for every way a push send can fail (no Firebase service
// account configured, or the FCM API call itself failing) — same "one error
// type, one generic client-facing message" posture as GroqUnavailableError/
// StripeUnavailableError. ReminderCronService catches this and logs a
// warning instead of crashing the daily job; the admin "test push" route
// maps it to a 503, same convention as billing's Stripe-unavailable mapping.
export class PushUnavailableError extends Error {}
