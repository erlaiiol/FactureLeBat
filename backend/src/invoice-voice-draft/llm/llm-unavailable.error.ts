// Single error type for every way a call to whichever LlmClient is
// currently bound can fail (no API key configured, network error, timeout,
// non-2xx, malformed response) — thrown by every LlmClient implementation
// alike, so InvoiceVoiceDraftService's catch block never needs to know
// which provider is actually behind LLM_CLIENT. Same "one error type, one
// generic client-facing message" posture as GroqUnavailableError.
export class LlmUnavailableError extends Error {}
