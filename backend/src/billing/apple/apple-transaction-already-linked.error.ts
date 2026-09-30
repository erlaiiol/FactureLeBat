// Thrown when a verified Apple originalTransactionId is already linked to a
// *different* company than the one requesting verification — e.g. the same
// sandbox Apple ID / real Apple ID used to purchase under two different
// FactureLe accounts (a realistic scenario during testing, and in
// principle also for a real artisan who signs into the wrong company).
// appleOriginalTransactionId is unique on Company (schema.prisma), so
// writing it to a second company would otherwise surface as a raw Prisma
// unique-constraint error (P2002) instead of a clear message — see
// BillingService.verifyApplePurchase.
export class AppleTransactionAlreadyLinkedError extends Error {}
