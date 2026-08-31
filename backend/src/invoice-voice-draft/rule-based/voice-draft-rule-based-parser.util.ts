import { DocumentType, Unit } from '../../../generated/prisma/enums';

// Pure text-extraction helpers for the rule-based engine (see
// rule-based-draft-resolver.service.ts) — no DB access, no fuzzy matching,
// just regex/heuristics over the raw transcript. Deliberately narrower
// than an LLM: every function here documents what it can't handle so the
// resolver service knows when to fall back to a `needsReview` flag rather
// than a silent guess (this feature's one non-negotiable rule, engine
// notwithstanding — see docs/1.4/1.4-1's "never silently wrong").

// ---- Document type -------------------------------------------------------

export interface DocumentTypeDetection {
  documentType: DocumentType;
  confident: boolean;
}

// Whole-word match only ("devis"/"facture" as their own token) — a plain
// substring match would also fire inside unrelated words. Both words
// present (e.g. a mid-sentence self-correction like "un devis... non, une
// facture") or neither present both come back not confident: this parser
// has no way to tell which of two mentions is the artisan's real final
// intent, so it defaults to FACTURE (the more common case, same default
// the LLM prompt already uses) and lets the resolver flag it for review
// rather than guess.
export function detectDocumentType(transcript: string): DocumentTypeDetection {
  const hasDevis = /\bdevis\b/i.test(transcript);
  const hasFacture = /\bfacture\b/i.test(transcript);
  if (hasDevis && !hasFacture) {
    return { documentType: DocumentType.DEVIS, confident: true };
  }
  if (hasFacture && !hasDevis) {
    return { documentType: DocumentType.FACTURE, confident: true };
  }
  return { documentType: DocumentType.FACTURE, confident: false };
}

// ---- Deposit ("acompte") --------------------------------------------------

export interface DepositDetection {
  mentioned: boolean;
  percentageBasisPoints?: number;
  // true when "l'acompte habituel" was said but this company has no
  // default rate to resolve it against (Company.defaultDepositPercentageBasisPoints)
  // — the resolver flags needsReview on this specifically.
  habitualWithNoDefault?: boolean;
}

const DEPOSIT_PERCENTAGE_REGEX = /acompte[^%\d]{0,15}(\d{1,3}(?:[.,]\d+)?)\s*%/i;
const DEPOSIT_HABITUAL_REGEX = /acompte\s+habituel/i;
const DEPOSIT_MENTIONED_REGEX = /\bacompte\b/i;

export function detectDeposit(
  transcript: string,
  companyDefaultDepositPercentageBasisPoints: number | null,
): DepositDetection {
  const percentMatch = transcript.match(DEPOSIT_PERCENTAGE_REGEX);
  if (percentMatch) {
    const percent = parseFloat(percentMatch[1].replace(',', '.'));
    if (!Number.isNaN(percent)) {
      return { mentioned: true, percentageBasisPoints: Math.round(percent * 100) };
    }
  }
  if (DEPOSIT_HABITUAL_REGEX.test(transcript)) {
    if (companyDefaultDepositPercentageBasisPoints != null) {
      return { mentioned: true, percentageBasisPoints: companyDefaultDepositPercentageBasisPoints };
    }
    return { mentioned: true, habitualWithNoDefault: true };
  }
  if (DEPOSIT_MENTIONED_REGEX.test(transcript)) {
    // "acompte" said but no percentage and not "habituel" either — mentioned,
    // but this parser has no rate to attach to it.
    return { mentioned: true };
  }
  return { mentioned: false };
}

// ---- Customer name candidate ----------------------------------------------

// Captures the phrase after "pour " up to the next clause boundary — covers
// every example transcript in docs/1.4/1.4-1's table ("facture pour Xavier
// Dupont, ..."). Known gap, documented rather than silently guessed around:
// phrasing that names the client without "pour" (e.g. "facture à Xavier
// Dupont") isn't recognized — the resolver flags a missing customer as
// needsReview: no_match, never invents one.
const CUSTOMER_CANDIDATE_REGEX = /\bpour\s+([^,.]+?)(?:\s*,|\s+je\b|\s+et\b|\.|$)/i;

export function extractCustomerNameCandidate(transcript: string): string | undefined {
  const match = transcript.match(CUSTOMER_CANDIDATE_REGEX);
  const candidate = match?.[1]?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

// ---- Line items (quantity + unit + description) --------------------------

export interface LineCandidate {
  quantity: number;
  unit: Unit;
  description: string;
}

// Ordered so a more specific pattern (m², m³) is tried before a shorter one
// that could otherwise false-positive inside it.
const UNIT_TEXT_PATTERNS: Array<{ unit: Unit; source: string }> = [
  { unit: Unit.SQUARE_METER, source: 'm\\s?2|m²|m\\.?\\s?carr[ée]s?|m[èe]tres?\\s+carr[ée]s?' },
  { unit: Unit.CUBIC_METER, source: 'm\\s?3|m³|m[èe]tres?\\s+cubes?' },
  // No leading \b before "ml"/"kg": a quantity glued directly to its unit
  // with no space ("10kg", "5ml") has a digit immediately to the left,
  // which counts as a word character just like the letter that follows —
  // \b requires an actual word/non-word transition, so a leading \b here
  // would silently fail to match exactly the "no space" phrasing dictation
  // most often produces. The left edge is already anchored by this being
  // matched right after the quantity capture; only the right edge (\b)
  // needs to guard against e.g. matching "kg" inside a longer word.
  // The bare "mètre(s)" fallback is last within this unit's own
  // alternatives (tried only once "mètres carrés"/"cubes" above have had
  // their chance at the same position) — caught live, 2026-08-29: without
  // it, "10 mètres de lambris" produced zero lines instead of one flagged
  // for review, silently dropping the whole item rather than surfacing it.
  { unit: Unit.LINEAR_METER, source: 'ml\\b|m[èe]tres?\\s+lin[ée]aires?|m[èe]tres?\\b' },
  { unit: Unit.KILOGRAM, source: 'kg\\b|kilos?|kilogrammes?' },
  { unit: Unit.LITER, source: 'litres?' },
  { unit: Unit.HOUR, source: 'heures?' },
  { unit: Unit.DAY, source: 'jours?|journ[ée]es?' },
  { unit: Unit.LUMP_SUM, source: 'forfaits?' },
  // Packaging/count words — added 2026-08-30 after live testing against a
  // real materials catalog (sacs de ciment, rouleaux d'isolant, plaques de
  // placo, tubes PER...) showed every one of them fell through to the
  // generic-word safety net below instead of matching a known unit. These
  // don't get their own Unit value (none fits better than UNIT/"pièce"
  // does), and a confident product match overwrites this with the
  // catalog's own real unit anyway (see resolveOneLine) — this table only
  // needs to recognize the word, not model it precisely.
  {
    unit: Unit.UNIT,
    source:
      'unit[ée]s?|pi[èe]ces?|sacs?|rouleaux?|plaques?|tubes?|barres?|bo[iî]tes?|paquets?|cartons?|palettes?|bidons?|seaux?|pots?',
  },
];

// One alternation built from the table above, in order — used both to find
// a quantity+unit pair and, per match, to identify which Unit it was.
const QUANTITY_UNIT_REGEX = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_TEXT_PATTERNS.map((p) => p.source).join('|')})`,
  'gi',
);

function matchUnit(text: string): Unit | undefined {
  const normalized = text.toLowerCase();
  return UNIT_TEXT_PATTERNS.find((p) => new RegExp(`^(${p.source})$`, 'i').test(normalized))?.unit;
}

// A line's description is whatever follows "de "/"d'" right after its
// quantity+unit, up to the next line's own match, a comma, " et ", a
// period, or the deposit clause — whichever comes first. Known gap: a
// quantity spelled out in words ("vingt-cinq mètres carrés" rather than
// "25m²") isn't recognized — no line is extracted for it at all, which
// the resolver surfaces as "nothing to build a draft from" rather than a
// wrong one, same "silence over a guess" rule as everywhere else.
function extractDescriptionAfter(
  transcript: string,
  afterIndex: number,
  upperBound: number,
): string {
  let span = transcript.slice(afterIndex, upperBound);
  span = span.replace(/^\s*(de\s+|d['’]\s*)/i, '');
  // Cuts at the first clause boundary — a plain "et" is treated as a
  // separator between dictated items (the common case in this app's own
  // example transcripts) rather than a literal "et" inside a product
  // name; a genuine "vis et chevilles"-style name would need a real
  // catalog match to recover correctly, which is exactly what the
  // resolver's own fuzzy search step still gets a chance to do even off
  // a truncated description.
  const boundary = span.search(/,|\bet\b|\.| avec | pour |$/i);
  if (boundary >= 0) {
    span = span.slice(0, boundary);
  }
  return span.trim();
}

interface QuantityMatch {
  start: number;
  end: number;
  quantity: number;
  unit?: Unit;
  word: string;
}

// Any digit run followed by a word — cast far wider than
// QUANTITY_UNIT_REGEX's known vocabulary on purpose: this is the pass that
// catches whatever UNIT_TEXT_PATTERNS doesn't yet know (a packaging word
// nobody's added, a typo, dictation-software phrasing). Requires a letter
// right after the number so "acompte de 20%" ('%', not a letter) is never
// mistaken for a line.
const GENERIC_QUANTITY_WORD_REGEX = /(\d+(?:[.,]\d+)?)\s*([a-zàâäéèêëïîôöùûüçñ]+)/gi;

export function extractLineCandidates(transcript: string): LineCandidate[] {
  const known: QuantityMatch[] = [];
  for (const match of transcript.matchAll(QUANTITY_UNIT_REGEX)) {
    const quantity = parseFloat(match[1].replace(',', '.'));
    const unit = matchUnit(match[2]);
    if (unit === undefined || Number.isNaN(quantity)) {
      continue;
    }
    const start = match.index ?? 0;
    known.push({ start, end: start + match[0].length, quantity, unit, word: match[2] });
  }

  // Safety net: a quantity dictated with a unit word this parser doesn't
  // recognize must still surface as a flagged line, never vanish with zero
  // trace — same "never silently wrong" rule the rest of this engine
  // follows. Caught live 2026-08-30: "5 sacs de ciment" produced nothing at
  // all before this (and before "sacs" was added to UNIT_TEXT_PATTERNS).
  const unknown: QuantityMatch[] = [];
  for (const match of transcript.matchAll(GENERIC_QUANTITY_WORD_REGEX)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (known.some((k) => start < k.end && end > k.start)) {
      continue;
    }
    const quantity = parseFloat(match[1].replace(',', '.'));
    if (Number.isNaN(quantity)) {
      continue;
    }
    unknown.push({ start, end, quantity, word: match[2] });
  }

  const all = [...known, ...unknown].sort((a, b) => a.start - b.start);
  const results: LineCandidate[] = [];

  for (let i = 0; i < all.length; i++) {
    const current = all[i];
    const upperBound = i + 1 < all.length ? all[i + 1].start : transcript.length;
    const rest = extractDescriptionAfter(transcript, current.end, upperBound);

    if (current.unit !== undefined) {
      if (rest.length > 0) {
        results.push({ quantity: current.quantity, unit: current.unit, description: rest });
      }
      continue;
    }

    // Unknown unit word — nothing consumed it, so it belongs in the
    // description rather than the "de "/word-after logic (which assumes
    // the unit word itself was already stripped out).
    const description = rest.length > 0 ? `${current.word} ${rest}` : current.word;
    results.push({ quantity: current.quantity, unit: Unit.UNIT, description });
  }

  return results;
}

// A transcript with no document-type keyword, no customer candidate, and
// no line candidate at all has nothing this parser can build a draft
// from — same "reject rather than open an all-blank form" rule the LLM
// engine's own `reject` tool follows (see docs/1.4/1.4-1's transcript #10).
export function hasNoExtractableContent(transcript: string): boolean {
  const { confident: documentTypeConfident } = detectDocumentType(transcript);
  const hasCustomer = extractCustomerNameCandidate(transcript) !== undefined;
  const hasLines = extractLineCandidates(transcript).length > 0;
  return !documentTypeConfident && !hasCustomer && !hasLines;
}
