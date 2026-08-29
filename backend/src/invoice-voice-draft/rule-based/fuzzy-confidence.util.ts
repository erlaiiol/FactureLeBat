import { FuzzyMatch } from '../../common/fuzzy-match';
import { NeedsReviewReason } from '../entities/voice-invoice-draft.entity';

// The rule-based engine's one piece of judgment an LLM would otherwise
// make for itself: given a ranked list of fuzzy candidates for one
// reference (a customer, a product, a service), decide whether to trust
// the top one outright, flag it as a low-confidence guess, or flag the
// whole set as ambiguous — never silently pick a wrong one. Pure and
// engine-agnostic on purpose (no DB access, no I/O) so it's trivially
// unit-testable on its own.
export interface FuzzyPick<T> {
  // Set only when confident enough to use outright, unflagged.
  picked?: FuzzyMatch<T>;
  // Set only when not confident — the resolver attaches this as the
  // field's needsReview.reason.
  reason?: NeedsReviewReason;
  // The best candidate to offer as needsReview.suggestion, when reason is
  // set and there's an actual candidate worth suggesting (absent for a
  // bare no_match with zero candidates at all).
  suggestionCandidate?: FuzzyMatch<T>;
}

// Below this score, even an uncontested single match reads as a guess, not
// a confident resolution — same order of magnitude as
// CustomerRepository.FUZZY_SIMILARITY_THRESHOLD (0.2, the DB-level "is
// this even a candidate" cutoff); this is the stricter "trust it outright"
// cutoff one layer up.
const CONFIDENT_THRESHOLD = 0.5;
// Two candidates within this margin of each other are too close to call —
// flagged ambiguous rather than silently taking whichever the DB happened
// to rank first.
const AMBIGUOUS_MARGIN = 0.1;

export function pickBestMatch<T>(matches: FuzzyMatch<T>[]): FuzzyPick<T> {
  if (matches.length === 0) {
    return { reason: 'no_match' };
  }

  const [top, second] = matches;
  if (second && top.score - second.score < AMBIGUOUS_MARGIN) {
    return { reason: 'ambiguous_match', suggestionCandidate: top };
  }
  if (top.score >= CONFIDENT_THRESHOLD) {
    return { picked: top };
  }
  return { reason: 'low_confidence_match', suggestionCandidate: top };
}
