// Phase 10 sourcing assistant. Model ids are hardcoded constants (not env
// vars) — same posture as SafeFetcherService's REQUEST_TIMEOUT_MS/MAX_REDIRECTS:
// they're implementation detail, easy to bump in code, not a deployment knob.

// Groq's web-search-grounded model: decides on its own when to actually
// browse vs. answer from general knowledge, so it's used for the one call
// that needs live, current supplier pricing.
export const SUPPLIER_SEARCH_MODEL = 'groq/compound';

// A small, fast, free-tier model — no web access needed for complementary-
// material suggestions, which draw on general construction-trade knowledge
// rather than live pricing (see docs/roadmap.md Phase 10).
export const COMPLEMENTARY_SUGGESTION_MODEL = 'llama-3.1-8b-instant';

export const MAX_SUPPLIER_CANDIDATES = 5;
export const MAX_COMPLEMENTARY_SUGGESTIONS = 5;

// How long a cached result stays fresh before a re-search is allowed to hit
// Groq again — bounds how stale a "verify before ordering" price can get
// while still making "reopening a line doesn't re-trigger a live search"
// meaningful (see docs/roadmap.md Phase 10).
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_DAILY_SEARCH_CAP = 20;

// Shown alongside every result, both kinds — the reliability ceiling the
// roadmap calls out explicitly: a model reading web pages can find a listed
// price, but never a guaranteed one.
export const VERIFY_BEFORE_ORDERING_NOTICE =
  "Résultats générés automatiquement à partir d'une recherche web : prix, stock et délais sont à vérifier directement auprès du fournisseur avant toute commande.";
