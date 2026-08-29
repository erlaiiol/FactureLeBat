export const MAX_TOKENS = 2048;

// Bounds how many search-tool round-trips one voice-draft call can take
// before this gives up and rejects — a real transcript needs at most a
// handful of searches (one customer, a few products/services). A safety
// ceiling against a runaway loop, not a number any real request should
// approach.
export const MAX_TOOL_ITERATIONS = 6;

export const UNAVAILABLE_MESSAGE =
  "La création par commande vocale (IA) n'est pas configurée pour le moment.";
export const FAILED_MESSAGE =
  'La création par commande vocale (IA) a échoué. Vous pouvez réessayer dans quelques instants.';
export const DAILY_CAP_MESSAGE =
  'Quota quotidien de commandes vocales (IA) atteint. Réessayez demain.';

export const DEFAULT_DAILY_CAP = 30;
