// Single error type for every way a Groq call can fail (no API key
// configured, network error, timeout, non-2xx, malformed response) — same
// "one error type, one generic client-facing message" posture as
// ProductImportUnavailableError.
export class GroqUnavailableError extends Error {}
