// Single error type for every way an import can fail (blocked IP, timeout,
// bad content-type, too large, non-2xx, redirect loop). The controller
// layer turns any instance of this into one generic client-facing message —
// internal reasons are logged, never leaked to the artisan (same posture as
// the rest of the API's 500-hides-details convention).
export class ProductImportUnavailableError extends Error {}
